import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/index.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

export const platformLicenseRouter = Router();

const generateLicenseKey = (): { key: string; hash: string } => {
	const raw = Array.from(crypto.randomBytes(16))
		.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
		.join("")
		.replace(/[^A-Z0-9]/g, "")
		.substring(0, 16);

	const formatted = `${raw.substring(0, 4)}-${raw.substring(4, 8)}-${raw.substring(8, 12)}-${raw.substring(12, 16)}`;
	const normalized = formatted.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
	const hash = crypto.createHash("sha256").update(normalized).digest("hex");

	return { key: formatted, hash };
};

platformLicenseRouter.post("/licenses/issue", requireAuth, requireSuperAdmin, async (req, res) => {
	const { orgId, planCode, maxDevices, expiresAt } = req.body as {
		orgId: string;
		planCode?: string;
		maxDevices?: number;
		expiresAt?: string;
	};

	if (!orgId) {
		return res.status(400).json({ error: "orgId required" });
	}

	const orgResult = await db.query("SELECT id FROM orgs WHERE id = $1", [orgId]);
	if ((orgResult.rowCount ?? 0) === 0) {
		return res.status(404).json({ error: "Organization not found" });
	}

	const { key, hash } = generateLicenseKey();

	const licenseResult = await db.query(
		`INSERT INTO licenses (license_key_hash, status, plan_code, max_devices, expires_at, issued_to_org_id, metadata)
		 VALUES ($1, 'active', $2, $3, $4, $5, $6)
		 RETURNING id, status, plan_code, max_devices, expires_at, issued_to_org_id, created_at`,
		[hash, planCode || "perpetual", maxDevices || 1, expiresAt || null, orgId, JSON.stringify({ issuer: "platform" })]
	);

	logger.info("Platform license issued", { licenseId: licenseResult.rows[0].id, orgId });

	return res.json({
		licenseKey: key,
		license: licenseResult.rows[0]
	});
});

platformLicenseRouter.post("/licenses/activate", requireAuth, requireSuperAdmin, async (req, res) => {
	const { licenseKey, deviceId, deviceLabel, orgId } = req.body as {
		licenseKey: string;
		deviceId: string;
		deviceLabel?: string;
		orgId: string;
	};

	if (!licenseKey || !deviceId || !orgId) {
		return res.status(400).json({ error: "licenseKey, deviceId, and orgId required" });
	}

	const normalized = licenseKey.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
	const hash = crypto.createHash("sha256").update(normalized).digest("hex");

	const licenseResult = await db.query(
		"SELECT id, status, plan_code, max_devices, expires_at, issued_to_org_id FROM licenses WHERE license_key_hash = $1",
		[hash]
	);

	if (licenseResult.rowCount === 0) {
		return res.status(404).json({ error: "License not found" });
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
		return res.status(400).json({ error: "License is not active" });
	}

	if (license.expires_at && new Date(license.expires_at) < new Date()) {
		return res.status(400).json({ error: "License has expired" });
	}

	if (license.issued_to_org_id && license.issued_to_org_id !== orgId) {
		return res.status(400).json({ error: "License is bound to a different organization" });
	}

	const existingActivation = await db.query(
		"SELECT id FROM license_activations WHERE org_id = $1 AND device_id = $2 AND deactivated_at IS NULL",
		[orgId, deviceId]
	);

	if ((existingActivation.rowCount ?? 0) > 0) {
		return res.json({
			activated: true,
			activationId: existingActivation.rows[0].id,
			licenseId: license.id,
			planCode: license.plan_code,
			expiresAt: license.expires_at
		});
	}

	const activeDevicesResult = await db.query(
		"SELECT COUNT(*)::int AS count FROM license_activations WHERE license_id = $1 AND deactivated_at IS NULL",
		[license.id]
	);

	const activeDevices = activeDevicesResult.rows[0].count;
	if (activeDevices >= license.max_devices) {
		return res.status(400).json({ error: "Device activation limit reached" });
	}

	if (!license.issued_to_org_id) {
		await db.query(
			"UPDATE licenses SET issued_to_org_id = $1, updated_at = now() WHERE id = $2",
			[orgId, license.id]
		);
	}

	const activationResult = await db.query(
		"INSERT INTO license_activations (license_id, org_id, user_id, device_id, device_label) VALUES ($1, $2, $3, $4, $5) RETURNING id, activated_at",
		[license.id, orgId, req.auth!.userId, deviceId, deviceLabel || null]
	);

	logger.info("Platform license activated", {
		licenseId: license.id,
		deviceId,
		orgId,
		activationId: activationResult.rows[0].id
	});

	return res.json({
		activated: true,
		activationId: activationResult.rows[0].id,
		licenseId: license.id,
		planCode: license.plan_code,
		expiresAt: license.expires_at
	});
});
