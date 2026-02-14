/**
 * Webhook Health Management
 * 
 * Tracks webhook verification, template sync status, and error logging
 */

import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";

export type SyncStatus = "pending" | "syncing" | "success" | "error";

/**
 * Initialize webhook health record for organization
 */
export const initializeWebhookHealth = async (orgId: string): Promise<void> => {
	try {
		await db.query(
			`INSERT INTO webhook_health (org_id, webhook_verified, template_sync_status)
			 VALUES ($1, false, 'pending')
			 ON CONFLICT (org_id) DO NOTHING`,
			[orgId]
		);
	} catch (error: any) {
		logger.error("Failed to initialize webhook health", {
			error: error.message,
			orgId
		});
	}
};

/**
 * Update webhook verification status
 */
export const markWebhookVerified = async (orgId: string): Promise<void> => {
	try {
		await db.query(
			`UPDATE webhook_health 
			 SET webhook_verified = true, last_webhook_timestamp = now(), updated_at = now()
			 WHERE org_id = $1`,
			[orgId]
		);

		logger.info("Webhook marked as verified", { orgId });
	} catch (error: any) {
		logger.error("Failed to mark webhook as verified", {
			error: error.message,
			orgId
		});
	}
};

/**
 * Update template sync status
 */
export const updateTemplateSyncStatus = async (
	orgId: string,
	status: SyncStatus,
	count: number = 0,
	error: string | null = null
): Promise<void> => {
	try {
		const query =
			status === "success"
				? `UPDATE webhook_health 
				   SET template_sync_status = $1, 
					   last_template_sync = now(),
					   template_sync_count = $2,
					   error_message = NULL,
					   updated_at = now()
				   WHERE org_id = $3`
				: `UPDATE webhook_health 
				   SET template_sync_status = $1, 
					   error_message = $2,
					   updated_at = now()
				   WHERE org_id = $3`;

		const params =
			status === "success" ? [status, count, orgId] : [status, error || null, orgId];

		await db.query(query, params);

		logger.info("Template sync status updated", {
			orgId,
			status,
			count,
			error
		});
	} catch (err: any) {
		logger.error("Failed to update template sync status", {
			error: err.message,
			orgId
		});
	}
};

/**
 * Get webhook health status for organization
 */
export const getWebhookHealth = async (
	orgId: string
): Promise<{
	webhookVerified: boolean;
	lastWebhookTime?: string;
	templateSyncStatus: SyncStatus;
	lastTemplateSync?: string;
	templateSyncCount: number;
	errorMessage?: string;
} | null> => {
	try {
		const result = await db.query(
			`SELECT webhook_verified, last_webhook_timestamp, template_sync_status,
					last_template_sync, template_sync_count, error_message
			 FROM webhook_health
			 WHERE org_id = $1`,
			[orgId]
		);

		if (result.rowCount === 0) {
			return null;
		}

		const row = result.rows[0];

		return {
			webhookVerified: row.webhook_verified,
			lastWebhookTime: row.last_webhook_timestamp,
			templateSyncStatus: row.template_sync_status,
			lastTemplateSync: row.last_template_sync,
			templateSyncCount: row.template_sync_count,
			errorMessage: row.error_message
		};
	} catch (error: any) {
		logger.error("Failed to get webhook health", {
			error: error.message,
			orgId
		});
		return null;
	}
};
