/**
 * Subscription-Based License Management Routes
 * 
 * Comprehensive API for:
 * - License instance management (create, renew, revoke)
 * - Device activation & heartbeat
 * - Subscription lifecycle
 * - Super admin controls
 */

import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import {
	generateLicenseKey,
	validateLicenseKey,
	hashKey,
	normalizeKey,
	type LicenseKey
} from "../services/licenseKeyGenerator.js";
import { logger } from "../utils/logger.js";

export const subscriptionLicenseRouter = Router();

// ====================================================================
// SUPER ADMIN ENDPOINTS - License Plan Management
// ====================================================================

/**
 * GET /subscription/plans
 * List all license plans
 */
subscriptionLicenseRouter.get("/plans", requireAuth, requireSuperAdmin, async (_req, res) => {
	try {
		const result = await db.query(
			`SELECT * FROM license_plans 
			 WHERE is_active = true 
			 ORDER BY price_cents ASC`
		);

		return res.json({ plans: result.rows });
	} catch (error) {
		logger.error("Error fetching license plans:", error);
		return res.status(500).json({ error: "Failed to fetch plans" });
	}
});

/**
 * POST /subscription/plans
 * Create a new license plan
 */
subscriptionLicenseRouter.post("/plans", requireAuth, requireSuperAdmin, async (req, res) => {
	const { name, code, durationDays, maxDevices, features, priceCents } = req.body as {
		name: string;
		code: string;
		durationDays?: number;
		maxDevices?: number;
		features?: Record<string, unknown>;
		priceCents?: number;
	};

	if (!name || !code) {
		return res.status(400).json({ error: "name and code required" });
	}

	try {
		const result = await db.query(
			`INSERT INTO license_plans 
			 (name, code, duration_days, max_devices, features, price_cents)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING *`,
			[
				name,
				code,
				durationDays || 365,
				maxDevices || 1,
				JSON.stringify(features || {}),
				priceCents || 0
			]
		);

		await logAuditEvent({
			actorId: req.auth!.userId,
			action: "plan_created",
			targetType: "plan",
			targetId: result.rows[0].id,
			details: { name, code }
		});

		return res.json({ plan: result.rows[0] });
	} catch (error: any) {
		logger.error("Error creating license plan:", error);
		if (error.code === "23505") {
			// Unique violation
			return res.status(409).json({ error: "Plan code already exists" });
		}
		return res.status(500).json({ error: "Failed to create plan" });
	}
});

// ====================================================================
// SUPER ADMIN ENDPOINTS - License Instance Management
// ====================================================================

/**
 * POST /subscription/instances
 * Issue a new subscription license to an organization
 */
subscriptionLicenseRouter.post("/instances", requireAuth, requireSuperAdmin, async (req, res) => {
	const { orgId, planCode, seats, expiresAt, metadata } = req.body as {
		orgId: string;
		planCode: string;
		seats?: number;
		expiresAt?: string;
		metadata?: Record<string, unknown>;
	};

	if (!orgId || !planCode) {
		return res.status(400).json({ error: "orgId and planCode required" });
	}

	try {
		// Verify organization exists
		const orgResult = await db.query("SELECT id, name FROM orgs WHERE id = $1", [orgId]);
		if (orgResult.rowCount === 0) {
			return res.status(404).json({ error: "Organization not found" });
		}

		// Get plan details
		const planResult = await db.query(
			"SELECT id, duration_days, max_devices FROM license_plans WHERE code = $1",
			[planCode]
		);
		if (planResult.rowCount === 0) {
			return res.status(404).json({ error: "Plan not found" });
		}

		const plan = planResult.rows[0];
		const licenseKey = generateLicenseKey();

		// Calculate expiry date (default: plan duration from now)
		const expiryDate = expiresAt
			? new Date(expiresAt)
			: new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000);

		// Insert license
		const licenseResult = await db.query(
			`INSERT INTO licenses 
			 (license_key_hash, status, plan_code, plan_id, max_devices, seats_total, 
			  expires_at, issued_to_org_id, issued_by, issued_at, metadata)
			 VALUES ($1, 'active', $2, $3, $4, $5, $6, $7, $8, now(), $9)
			 RETURNING *`,
			[
				licenseKey.hash,
				planCode,
				plan.id,
				plan.max_devices,
				seats || plan.max_devices,
				expiryDate,
				orgId,
				req.auth!.userId,
				JSON.stringify(metadata || {})
			]
		);

		// Log audit event
		await logAuditEvent({
			actorId: req.auth!.userId,
			action: "license_issued",
			targetType: "license",
			targetId: licenseResult.rows[0].id,
			orgId,
			details: {
				planCode,
				seats: seats || plan.max_devices,
				expiresAt: expiryDate.toISOString(),
				orgName: orgResult.rows[0].name
			}
		});

		logger.info("Subscription license issued", {
			licenseId: licenseResult.rows[0].id,
			orgId,
			planCode
		});

		return res.json({
			licenseKey: licenseKey.key, // Return the actual key ONCE
			license: licenseResult.rows[0]
		});
	} catch (error) {
		logger.error("Error issuing subscription license:", error);
		return res.status(500).json({ error: "Failed to issue license" });
	}
});

/**
 * GET /subscription/instances
 * List all subscription licenses (super admin)
 */
subscriptionLicenseRouter.get("/instances", requireAuth, requireSuperAdmin, async (req, res) => {
	const { orgId, status } = req.query as { orgId?: string; status?: string };

	try {
		let query = `
			SELECT 
				l.*,
				lp.name AS plan_name,
				o.name AS org_name,
				(SELECT COUNT(*)::int FROM license_activations la 
				 WHERE la.license_id = l.id AND la.deactivated_at IS NULL) AS active_devices,
				(SELECT MAX(la.last_heartbeat) FROM license_activations la 
				 WHERE la.license_id = l.id AND la.deactivated_at IS NULL) AS last_heartbeat
			FROM licenses l
			LEFT JOIN license_plans lp ON lp.id = l.plan_id
			LEFT JOIN orgs o ON o.id = l.issued_to_org_id
			WHERE 1=1
		`;

		const params: unknown[] = [];
		let paramIndex = 1;

		if (orgId) {
			query += ` AND l.issued_to_org_id = $${paramIndex++}`;
			params.push(orgId);
		}

		if (status) {
			query += ` AND l.status = $${paramIndex++}`;
			params.push(status);
		}

		query += " ORDER BY l.created_at DESC";

		const result = await db.query(query, params);

		return res.json({ licenses: result.rows });
	} catch (error) {
		logger.error("Error fetching licenses:", error);
		return res.status(500).json({ error: "Failed to fetch licenses" });
	}
});

/**
 * GET /subscription/instances/:id
 * Get detailed license information
 */
subscriptionLicenseRouter.get("/instances/:id", requireAuth, requireSuperAdmin, async (req, res) => {
	const { id } = req.params;

	try {
		const result = await db.query(
			`SELECT 
				l.*,
				lp.name AS plan_name,
				lp.features AS plan_features,
				o.name AS org_name,
				u.email AS issued_by_email
			FROM licenses l
			LEFT JOIN license_plans lp ON lp.id = l.plan_id
			LEFT JOIN orgs o ON o.id = l.issued_to_org_id
			LEFT JOIN users u ON u.id = l.issued_by
			WHERE l.id = $1`,
			[id]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "License not found" });
		}

		// Get activations
		const activationsResult = await db.query(
			`SELECT 
				la.*,
				u.email AS user_email
			FROM license_activations la
			LEFT JOIN users u ON u.id = la.user_id
			WHERE la.license_id = $1
			ORDER BY la.activated_at DESC`,
			[id]
		);

		return res.json({
			license: result.rows[0],
			activations: activationsResult.rows
		});
	} catch (error) {
		logger.error("Error fetching license details:", error);
		return res.status(500).json({ error: "Failed to fetch license" });
	}
});

/**
 * PUT /subscription/instances/:id/renew
 * Renew a subscription license (extend expiry by plan duration)
 */
subscriptionLicenseRouter.put("/instances/:id/renew", requireAuth, requireSuperAdmin, async (req, res) => {
	const { id } = req.params;
	const { extensionDays } = req.body as { extensionDays?: number };

	try {
		// Get current license
		const licenseResult = await db.query(
			`SELECT l.*, lp.duration_days 
			 FROM licenses l
			 LEFT JOIN license_plans lp ON lp.id = l.plan_id
			 WHERE l.id = $1`,
			[id]
		);

		if (licenseResult.rowCount === 0) {
			return res.status(404).json({ error: "License not found" });
		}

		const license = licenseResult.rows[0];
		const daysToAdd = extensionDays || license.duration_days || 365;

		// Calculate new expiry date
		const currentExpiry = license.expires_at ? new Date(license.expires_at) : new Date();
		const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
		const newExpiry = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

		// Update license
		const updateResult = await db.query(
			`UPDATE licenses 
			 SET expires_at = $1,
			     status = 'active',
			     renewed_at = now(),
			     updated_at = now()
			 WHERE id = $2
			 RETURNING *`,
			[newExpiry, id]
		);

		// Log audit event
		await logAuditEvent({
			actorId: req.auth!.userId,
			action: "license_renewed",
			targetType: "license",
			targetId: id,
			orgId: license.issued_to_org_id,
			details: {
				previousExpiry: license.expires_at,
				newExpiry: newExpiry.toISOString(),
				extensionDays: daysToAdd
			}
		});

		logger.info("License renewed", { licenseId: id, newExpiry });

		return res.json({ license: updateResult.rows[0] });
	} catch (error) {
		logger.error("Error renewing license:", error);
		return res.status(500).json({ error: "Failed to renew license" });
	}
});

/**
 * PUT /subscription/instances/:id/revoke
 * Revoke a subscription license (immediate termination)
 */
subscriptionLicenseRouter.put("/instances/:id/revoke", requireAuth, requireSuperAdmin, async (req, res) => {
	const { id } = req.params;
	const { reason } = req.body as { reason?: string };

	try {
		const result = await db.query(
			`UPDATE licenses 
			 SET status = 'revoked',
			     revoked_at = now(),
			     revoked_by = $1,
			     revoked_reason = $2,
			     updated_at = now()
			 WHERE id = $3
			 RETURNING *`,
			[req.auth!.userId, reason || null, id]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "License not found" });
		}

		// Revoke all refresh tokens for this license
		await db.query(
			`UPDATE license_refresh_tokens 
			 SET revoked_at = now()
			 WHERE activation_id IN (
			   SELECT id FROM license_activations WHERE license_id = $1
			 )`,
			[id]
		);

		// Log audit event
		await logAuditEvent({
			actorId: req.auth!.userId,
			action: "license_revoked",
			targetType: "license",
			targetId: id,
			orgId: result.rows[0].issued_to_org_id,
			details: { reason }
		});

		logger.info("License revoked", { licenseId: id, reason });

		return res.json({ license: result.rows[0] });
	} catch (error) {
		logger.error("Error revoking license:", error);
		return res.status(500).json({ error: "Failed to revoke license" });
	}
});

// ====================================================================
// DESKTOP CLIENT ENDPOINTS - Activation & Validation
// ====================================================================

/**
 * POST /subscription/activate
 * Activate a license on a desktop device
 */
subscriptionLicenseRouter.post("/activate", requireAuth, async (req, res) => {
	const { licenseKey, deviceId, deviceLabel, machineInfo } = req.body as {
		licenseKey: string;
		deviceId: string;
		deviceLabel?: string;
		machineInfo?: Record<string, unknown>;
	};

	if (!licenseKey || !deviceId) {
		return res.status(400).json({ error: "licenseKey and deviceId required" });
	}

	const orgId = req.auth!.orgId;
	const userId = req.auth!.userId;
	const ipAddress = req.ip || req.socket.remoteAddress;

	try {
		// Validate key format
		const validation = validateLicenseKey(licenseKey);
		if (!validation.valid) {
			return res.status(400).json({ error: validation.error || "Invalid license key" });
		}

		// Find license
		const licenseResult = await db.query(
			`SELECT l.*, lp.name AS plan_name 
			 FROM licenses l
			 LEFT JOIN license_plans lp ON lp.id = l.plan_id
			 WHERE l.license_key_hash = $1`,
			[validation.hash]
		);

		if (licenseResult.rowCount === 0) {
			return res.status(404).json({ error: "License key not found" });
		}

		const license = licenseResult.rows[0];

		// Check license status
		if (license.status === "revoked") {
			return res.status(403).json({ error: "License has been revoked" });
		}

		if (license.status === "expired") {
			return res.status(403).json({ error: "License has expired" });
		}

		// Check expiry
		if (license.expires_at && new Date(license.expires_at) <= new Date()) {
			await db.query("UPDATE licenses SET status = 'expired' WHERE id = $1", [license.id]);
			return res.status(403).json({ error: "License has expired" });
		}

		// Check org binding
		if (license.issued_to_org_id && license.issued_to_org_id !== orgId) {
			return res.status(403).json({ error: "License is assigned to a different organization" });
		}

		// Check if device already activated
		const existingActivation = await db.query(
			`SELECT id FROM license_activations 
			 WHERE org_id = $1 AND device_id = $2 AND deactivated_at IS NULL`,
			[orgId, deviceId]
		);

		if (existingActivation.rowCount! > 0) {
			// Update heartbeat
			await db.query(
				`UPDATE license_activations 
				 SET last_heartbeat = now(), last_validated_at = now()
				 WHERE id = $1`,
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

		// Check device limit
		const activeCountResult = await db.query(
			`SELECT COUNT(*)::int AS count 
			 FROM license_activations 
			 WHERE license_id = $1 AND deactivated_at IS NULL`,
			[license.id]
		);

		const activeCount = activeCountResult.rows[0].count;
		if (activeCount >= license.seats_total) {
			return res.status(409).json({
				error: "License device limit reached",
				limit: license.seats_total,
				active: activeCount
			});
		}

		// Activate device
		const activationResult = await db.query(
			`INSERT INTO license_activations 
			 (license_id, org_id, user_id, device_id, device_label, ip_address, machine_info)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 RETURNING id, activated_at`,
			[
				license.id,
				orgId,
				userId,
				deviceId,
				deviceLabel || null,
				ipAddress,
				JSON.stringify(machineInfo || {})
			]
		);

		// Update device fingerprint
		await updateDeviceFingerprint(deviceId, orgId, machineInfo);

		// Log audit event
		await logAuditEvent({
			actorId: userId,
			action: "device_activated",
			targetType: "activation",
			targetId: activationResult.rows[0].id,
			licenseId: license.id,
			orgId,
			details: { deviceId, deviceLabel },
			ipAddress
		});

		logger.info("Device activated", {
			licenseId: license.id,
			deviceId,
			orgId
		});

		return res.json({
			activated: true,
			activationId: activationResult.rows[0].id,
			licenseId: license.id,
			planCode: license.plan_code,
			planName: license.plan_name,
			expiresAt: license.expires_at,
			activatedAt: activationResult.rows[0].activated_at
		});
	} catch (error) {
		logger.error("Error activating license:", error);
		return res.status(500).json({ error: "Activation failed" });
	}
});

/**
 * POST /subscription/heartbeat
 * Daily heartbeat validation from desktop client
 */
subscriptionLicenseRouter.post("/heartbeat", requireAuth, async (req, res) => {
	const { deviceId, appVersion } = req.body as {
		deviceId: string;
		appVersion?: string;
	};

	if (!deviceId) {
		return res.status(400).json({ error: "deviceId required" });
	}

	const orgId = req.auth!.orgId;

	try {
		// Find active activation
		const activationResult = await db.query(
			`SELECT 
				la.id AS activation_id,
				la.license_id,
				l.status,
				l.plan_code,
				l.expires_at
			FROM license_activations la
			JOIN licenses l ON l.id = la.license_id
			WHERE la.org_id = $1 AND la.device_id = $2 AND la.deactivated_at IS NULL`,
			[orgId, deviceId]
		);

		if (activationResult.rowCount === 0) {
			return res.status(403).json({
				valid: false,
				reason: "not_activated",
				message: "Device not activated"
			});
		}

		const activation = activationResult.rows[0];

		// Check license status
		if (activation.status === "revoked") {
			return res.status(403).json({
				valid: false,
				reason: "revoked",
				message: "License has been revoked"
			});
		}

		if (activation.status === "expired") {
			return res.status(403).json({
				valid: false,
				reason: "expired",
				message: "License has expired"
			});
		}

		// Check expiry
		if (activation.expires_at && new Date(activation.expires_at) <= new Date()) {
			await db.query("UPDATE licenses SET status = 'expired' WHERE id = $1", [
				activation.license_id
			]);
			return res.status(403).json({
				valid: false,
				reason: "expired",
				message: "License has expired"
			});
		}

		// Update heartbeat
		await db.query(
			`UPDATE license_activations 
			 SET last_heartbeat = now(),
			     last_validated_at = now(),
			     app_version = $1
			 WHERE id = $2`,
			[appVersion || null, activation.activation_id]
		);

		// Log heartbeat (optional - can be sampled to reduce DB load)
		// await logAuditEvent({
		// 	actorId: req.auth!.userId,
		// 	action: "heartbeat",
		// 	targetType: "activation",
		// 	targetId: activation.activation_id,
		// 	licenseId: activation.license_id,
		// 	orgId,
		// 	details: { deviceId, appVersion }
		// });

		return res.json({
			valid: true,
			activationId: activation.activation_id,
			licenseId: activation.license_id,
			planCode: activation.plan_code,
			expiresAt: activation.expires_at
		});
	} catch (error) {
		logger.error("Error processing heartbeat:", error);
		return res.status(500).json({ error: "Heartbeat failed" });
	}
});

/**
 * POST /subscription/validate
 * Validate device activation (used on app startup)
 */
subscriptionLicenseRouter.post("/validate", requireAuth, async (req, res) => {
	const { deviceId } = req.body as { deviceId: string };

	if (!deviceId) {
		return res.status(400).json({ error: "deviceId required" });
	}

	const orgId = req.auth!.orgId;

	try {
		const result = await db.query(
			`SELECT 
				la.id AS activation_id,
				la.license_id,
				l.status,
				l.plan_code,
				l.expires_at
			FROM license_activations la
			JOIN licenses l ON l.id = la.license_id
			WHERE la.org_id = $1 AND la.device_id = $2 AND la.deactivated_at IS NULL`,
			[orgId, deviceId]
		);

		if (result.rowCount === 0) {
			return res.json({ activated: false, reason: "not_activated" });
		}

		const activation = result.rows[0];

		if (activation.status !== "active") {
			return res.json({ activated: false, reason: activation.status });
		}

		if (activation.expires_at && new Date(activation.expires_at) <= new Date()) {
			return res.json({ activated: false, reason: "expired" });
		}

		// Update validation timestamp
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
	} catch (error) {
		logger.error("Error validating license:", error);
		return res.status(500).json({ error: "Validation failed" });
	}
});

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================

async function logAuditEvent(params: {
	actorId: string;
	action: string;
	targetType: string;
	targetId: string;
	licenseId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	ipAddress?: string;
}) {
	try {
		await db.query(
			`INSERT INTO license_audit_logs 
			 (license_id, activation_id, actor_id, action, target_type, target_id, org_id, details, ip_address)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				params.licenseId || (params.targetType === "license" ? params.targetId : null),
				params.targetType === "activation" ? params.targetId : null,
				params.actorId,
				params.action,
				params.targetType,
				params.targetId,
				params.orgId || null,
				JSON.stringify(params.details || {}),
				params.ipAddress || null
			]
		);
	} catch (error) {
		logger.error("Error logging audit event:", error);
	}
}

async function updateDeviceFingerprint(
	deviceId: string,
	orgId: string,
	machineInfo?: Record<string, unknown>
) {
	try {
		const fingerprintHash = machineInfo
			? hashKey(JSON.stringify(machineInfo))
			: deviceId;

		await db.query(
			`INSERT INTO device_fingerprints (device_id, fingerprint_hash, org_id, activation_count, metadata)
			 VALUES ($1, $2, $3, 1, $4)
			 ON CONFLICT (device_id) DO UPDATE
			 SET last_seen_at = now(),
			     activation_count = device_fingerprints.activation_count + 1,
			     metadata = $4`,
			[deviceId, fingerprintHash, orgId, JSON.stringify(machineInfo || {})]
		);
	} catch (error) {
		logger.error("Error updating device fingerprint:", error);
	}
}
