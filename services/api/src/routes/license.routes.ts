import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/index.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const licenseRouter = Router();

const normalizeLicenseKey = (licenseKey: string) =>
	licenseKey.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

const hashLicenseKey = (licenseKey: string) => {
	const normalized = normalizeLicenseKey(licenseKey);
	return crypto.createHash("sha256").update(normalized).digest("hex");
};

const generateLicenseKey = () => {
	const raw = crypto.randomBytes(16).toString("hex").toUpperCase();
	return raw.match(/.{1,8}/g)?.join("-") ?? raw;
};

licenseRouter.post("/activate", requireAuth, async (req, res) => {
	const { licenseKey, deviceId, deviceLabel } = req.body as {
		licenseKey?: string;
		deviceId?: string;
		deviceLabel?: string;
	};

	if (!licenseKey || !deviceId) {
		return res.status(400).json({ error: "licenseKey and deviceId required" });
	}

	const orgId = req.auth!.orgId;
	const userId = req.auth!.userId;
	const licenseKeyHash = hashLicenseKey(licenseKey);

	const licenseResult = await db.query(
		"SELECT id, status, plan_code, max_devices, expires_at, issued_to_org_id FROM licenses WHERE license_key_hash = $1",
		[licenseKeyHash]
	);

	if (licenseResult.rowCount === 0) {
		return res.status(404).json({ error: "License key not found" });
	}

	const license = licenseResult.rows[0] as {
		id: string;
		status: string;
		plan_code: string;
		max_devices: number;
		expires_at: string | null;
		issued_to_org_id: string | null;
	};

	if (license.status !== "active") {
		return res.status(403).json({ error: "License is not active" });
	}

	if (license.expires_at && new Date(license.expires_at) <= new Date()) {
		return res.status(403).json({ error: "License has expired" });
	}

	if (license.issued_to_org_id && license.issued_to_org_id !== orgId) {
		return res.status(403).json({ error: "License not assigned to this org" });
	}

	const existingActivation = await db.query(
		"SELECT id FROM license_activations WHERE org_id = $1 AND device_id = $2 AND deactivated_at IS NULL",
		[orgId, deviceId]
	);

	if ((existingActivation.rowCount ?? 0) > 0) {
		await db.query(
			"UPDATE license_activations SET last_validated_at = now() WHERE id = $1",
			[existingActivation.rows[0].id]
		);
		return res.json({
			activated: true,
			activationId: existingActivation.rows[0].id,
			licenseId: license.id,
			planCode: license.plan_code,
			expiresAt: license.expires_at
		});
	}

	const activeCountResult = await db.query(
		"SELECT COUNT(*)::int AS count FROM license_activations WHERE license_id = $1 AND deactivated_at IS NULL",
		[license.id]
	);

	const activeCount = activeCountResult.rows[0].count as number;
	if (activeCount >= license.max_devices) {
		return res.status(409).json({ error: "License activation limit reached" });
	}

	if (!license.issued_to_org_id) {
		await db.query(
			"UPDATE licenses SET issued_to_org_id = $1, updated_at = now() WHERE id = $2",
			[orgId, license.id]
		);
	}

	const insertResult = await db.query(
		"INSERT INTO license_activations (license_id, org_id, user_id, device_id, device_label) VALUES ($1, $2, $3, $4, $5) RETURNING id, activated_at",
		[license.id, orgId, userId, deviceId, deviceLabel || null]
	);

	return res.json({
		activated: true,
		activationId: insertResult.rows[0].id,
		licenseId: license.id,
		planCode: license.plan_code,
		expiresAt: license.expires_at,
		activatedAt: insertResult.rows[0].activated_at
	});
});

licenseRouter.post("/validate", requireAuth, async (req, res) => {
	const { deviceId } = req.body as { deviceId?: string };
	if (!deviceId) {
		return res.status(400).json({ error: "deviceId required" });
	}

	const orgId = req.auth!.orgId;
	const activationResult = await db.query(
		`SELECT 
			la.id AS activation_id,
			l.id AS license_id,
			l.status,
			l.plan_code,
			l.expires_at
		FROM license_activations la
		JOIN licenses l ON l.id = la.license_id
		WHERE la.org_id = $1 AND la.device_id = $2 AND la.deactivated_at IS NULL`,
		[orgId, deviceId]
	);

	if (activationResult.rowCount === 0) {
		return res.json({ activated: false, reason: "not_activated" });
	}

	const activation = activationResult.rows[0] as {
		activation_id: string;
		license_id: string;
		status: string;
		plan_code: string;
		expires_at: string | null;
	};

	if (activation.status !== "active") {
		return res.json({ activated: false, reason: "inactive" });
	}

	if (activation.expires_at && new Date(activation.expires_at) <= new Date()) {
		return res.json({ activated: false, reason: "expired" });
	}

	await db.query(
		"UPDATE license_activations SET last_validated_at = now() WHERE id = $1",
		[activation.activation_id]
	);

	return res.json({
		activated: true,
		activationId: activation.activation_id,
		licenseId: activation.license_id,
		planCode: activation.plan_code,
		expiresAt: activation.expires_at
	});
});

licenseRouter.post("/admin/issue", requireAuth, requireAdmin, async (req, res) => {
	const { planCode, maxDevices, expiresAt, issuedToOrgId, metadata } = req.body as {
		planCode?: string;
		maxDevices?: number;
		expiresAt?: string;
		issuedToOrgId?: string;
		metadata?: Record<string, unknown>;
	};

	const plan = planCode?.trim() || "perpetual";
	const max = Number.isFinite(maxDevices) ? Number(maxDevices) : 1;

	if (!plan) {
		return res.status(400).json({ error: "planCode required" });
	}
	if (!Number.isInteger(max) || max <= 0) {
		return res.status(400).json({ error: "maxDevices must be a positive integer" });
	}

	const licenseKey = generateLicenseKey();
	const licenseKeyHash = hashLicenseKey(licenseKey);
	const orgId = req.auth!.orgId;
	const boundOrgId = issuedToOrgId || orgId;
	const expires = expiresAt ? new Date(expiresAt) : null;
	if (expiresAt && (!expires || Number.isNaN(expires.getTime()))) {
		return res.status(400).json({ error: "expiresAt must be a valid date" });
	}

	const insertResult = await db.query(
		"INSERT INTO licenses (license_key_hash, status, plan_code, max_devices, expires_at, issued_to_org_id, metadata) VALUES ($1, 'active', $2, $3, $4, $5, $6) RETURNING id, status, plan_code, max_devices, expires_at, issued_to_org_id, created_at",
		[licenseKeyHash, plan, max, expires, boundOrgId, metadata ? JSON.stringify(metadata) : null]
	);

	return res.status(201).json({
		licenseKey,
		license: insertResult.rows[0]
	});
});

licenseRouter.get("/admin/licenses", requireAuth, requireAdmin, async (req, res) => {
	const orgId = req.auth!.orgId;
	const result = await db.query(
		`SELECT
			l.id,
			l.status,
			l.plan_code,
			l.max_devices,
			l.expires_at,
			l.issued_to_org_id,
			l.created_at,
			l.updated_at,
			(SELECT COUNT(*)::int FROM license_activations la WHERE la.license_id = l.id AND la.deactivated_at IS NULL) AS active_devices,
			(SELECT COUNT(*)::int FROM license_activations la WHERE la.license_id = l.id) AS total_activations
		FROM licenses l
		WHERE l.issued_to_org_id = $1
		ORDER BY l.created_at DESC`,
		[orgId]
	);

	return res.json({ licenses: result.rows });
});

licenseRouter.get("/admin/licenses/:licenseId/activations", requireAuth, requireAdmin, async (req, res) => {
	const orgId = req.auth!.orgId;
	const { licenseId } = req.params as { licenseId: string };

	const licenseResult = await db.query(
		"SELECT id FROM licenses WHERE id = $1 AND issued_to_org_id = $2",
		[licenseId, orgId]
	);

	if (licenseResult.rowCount === 0) {
		return res.status(404).json({ error: "License not found" });
	}

	const activationsResult = await db.query(
		`SELECT
			la.id,
			la.device_id,
			la.device_label,
			la.activated_at,
			la.last_validated_at,
			la.deactivated_at,
			u.email AS user_email
		FROM license_activations la
		LEFT JOIN users u ON u.id = la.user_id
		WHERE la.license_id = $1
		ORDER BY la.activated_at DESC`,
		[licenseId]
	);

	return res.json({ activations: activationsResult.rows });
});

licenseRouter.post("/admin/revoke", requireAuth, requireAdmin, async (req, res) => {
	const { licenseId } = req.body as { licenseId?: string };
	if (!licenseId) {
		return res.status(400).json({ error: "licenseId required" });
	}

	const orgId = req.auth!.orgId;
	const licenseResult = await db.query(
		"UPDATE licenses SET status = 'revoked', updated_at = now() WHERE id = $1 AND issued_to_org_id = $2 RETURNING id",
		[licenseId, orgId]
	);

	if (licenseResult.rowCount === 0) {
		return res.status(404).json({ error: "License not found" });
	}

	await db.query(
		"UPDATE license_activations SET deactivated_at = now() WHERE license_id = $1 AND deactivated_at IS NULL",
		[licenseId]
	);

	return res.json({ revoked: true });
});

licenseRouter.post("/admin/deactivate", requireAuth, requireAdmin, async (req, res) => {
	const { activationId } = req.body as { activationId?: string };
	if (!activationId) {
		return res.status(400).json({ error: "activationId required" });
	}

	const orgId = req.auth!.orgId;
	const result = await db.query(
		`UPDATE license_activations
		SET deactivated_at = now()
		WHERE id = $1 AND org_id = $2 AND deactivated_at IS NULL
		RETURNING id`,
		[activationId, orgId]
	);

	if (result.rowCount === 0) {
		return res.status(404).json({ error: "Activation not found" });
	}

	return res.json({ deactivated: true });
});
