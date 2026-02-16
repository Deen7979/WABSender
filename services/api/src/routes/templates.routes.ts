import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { syncTemplatesForOrg, getApprovedTemplates, manualSyncTemplates } from "../services/templateSync.js";
import { logger } from "../utils/logger.js";
import { auditMiddleware, AuditAction, ResourceType } from "../middleware/auditLog.js";

export const templatesRouter = Router();

/**
 * GET /templates
 * List all APPROVED templates for the organization
 * Filtered to only show templates available for campaigns
 */
templatesRouter.get("/", requireAuth, async (req, res) => {
	try {
		const orgId = req.auth!.orgId;
		const templates = await getApprovedTemplates(orgId);
		res.json(templates);
	} catch (err: any) {
		logger.error("Failed to list templates", { error: err.message });
		res.status(500).json({ error: "Failed to fetch templates" });
	}
});

/**
 * POST /templates/sync
 * Manually trigger template synchronization from Meta
 * Idempotent - can be called multiple times safely
 */
templatesRouter.post("/sync", requireAuth, auditMiddleware(AuditAction.TEMPLATE_SYNCED, ResourceType.TEMPLATE), async (req, res) => {
	try {
		const orgId = req.auth!.orgId;
		const result = await manualSyncTemplates(orgId);

		if (!result.success) {
			return res.status(400).json({
				error: result.message,
				count: 0
			});
		}

		logger.info("Templates synced", {
			orgId,
			count: result.count
		});

		res.json({
			success: true,
			message: result.message,
			count: result.count
		});
	} catch (err: any) {
		logger.error("Template sync failed", { error: err.message });
		res.status(500).json({
			error: "Template sync failed",
			message: err.message
		});
	}
});

/**
 * GET /templates/status
 * Get template sync status and statistics
 */
templatesRouter.get("/status", requireAuth, async (req, res) => {
	try {
		const orgId = req.auth!.orgId;

		const result = await db.query(
			`SELECT 
				COUNT(*) as total_templates,
				SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
				MAX(updated_at) as last_sync
			 FROM templates 
			 WHERE org_id = $1`,
			[orgId]
		);

		const row = result.rows[0];

		res.json({
			totalTemplates: parseInt(row.total_templates) || 0,
			approvedCount: parseInt(row.approved_count) || 0,
			lastSync: row.last_sync
		});
	} catch (err: any) {
		logger.error("Failed to get template status", { error: err.message });
		res.status(500).json({ error: "Failed to fetch template status" });
	}
});
