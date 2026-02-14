import { Router } from "express";
import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";

export const webhookStatusRouter = Router();

/**
 * GET /webhook/health
 * Returns webhook and template sync health status
 */
webhookStatusRouter.get("/health", async (req, res) => {
	try {
		const orgId = req.query.org_id as string;
		if (!orgId) {
			return res.status(400).json({ error: "org_id required" });
		}

		// Ensure a webhook_health row exists for the org
		await db.query(
			"INSERT INTO webhook_health (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING",
			[orgId]
		);

		const result = await db.query(
			`SELECT 
				webhook_verified,
				last_webhook_timestamp,
				template_sync_status,
				last_template_sync,
				template_sync_count,
				error_message
			FROM webhook_health
			WHERE org_id = $1`,
			[orgId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Webhook health not found" });
		}

		const health = result.rows[0];
		res.json({
			webhookVerified: health.webhook_verified,
			lastWebhookTime: health.last_webhook_timestamp,
			syncStatus: health.template_sync_status,
			lastSyncTime: health.last_template_sync,
			syncCount: health.template_sync_count,
			error: health.error_message,
		});
	} catch (error: any) {
		logger.error("Error fetching webhook health", { error: error.message });
		res.status(500).json({ error: "Internal server error" });
	}
});

/**
 * GET /webhook/health/detailed
 * Returns detailed health metrics including template counts
 */
webhookStatusRouter.get("/health/detailed", async (req, res) => {
	try {
		const orgId = req.query.org_id as string;
		if (!orgId) {
			return res.status(400).json({ error: "org_id required" });
		}

		// Ensure a webhook_health row exists for the org
		await db.query(
			"INSERT INTO webhook_health (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING",
			[orgId]
		);

		// Get health status
		const healthResult = await db.query(
			`SELECT 
				webhook_verified,
				last_webhook_timestamp,
				template_sync_status,
				last_template_sync,
				template_sync_count,
				error_message
			FROM webhook_health
			WHERE org_id = $1`,
			[orgId]
		);

		if (healthResult.rowCount === 0) {
			return res.status(404).json({ error: "Webhook health not found" });
		}

		const health = healthResult.rows[0];

		// Get template counts
		const templateResult = await db.query(
			`SELECT 
				COUNT(*) as total,
				SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved
			FROM templates
			WHERE org_id = $1`,
			[orgId]
		);

		const templates = templateResult.rows[0];

		res.json({
			webhookVerified: health.webhook_verified,
			lastWebhookTime: health.last_webhook_timestamp,
			syncStatus: health.template_sync_status,
			lastSyncTime: health.last_template_sync,
			syncCount: health.template_sync_count,
			error: health.error_message,
			templates: {
				total: parseInt(templates.total, 10),
				approved: parseInt(templates.approved, 10),
			},
		});
	} catch (error: any) {
		logger.error("Error fetching detailed webhook health", { error: error.message });
		res.status(500).json({ error: "Internal server error" });
	}
});
