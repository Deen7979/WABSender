/**
 * WhatsApp Template Synchronization
 * 
 * Fetches approved message templates from Meta Graph API
 * Parses components and stores in local database
 * Only APPROVED templates are exposed to campaigns
 */

import { db } from "../db/index.js";
import { config } from "../config/index.js";
import { decryptToken } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";
import { updateTemplateSyncStatus } from "./webhookHealth.js";

interface MetaTemplate {
	name?: string;
	language?: string;
	status?: string;
	category?: string;
	components?: Array<{
		type: string;
		format?: string;
		text?: string;
		buttons?: Array<any>;
		body?: any;
		header?: any;
		footer?: any;
	}>;
	id?: string;
}

interface TemplateComponent {
	type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
	format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
	text?: string;
	buttons?: Array<{
		type: string;
		text: string;
		url?: string;
		phone_number?: string;
	}>;
}

/**
 * Sync templates from Meta for an organization
 * Called after successful OAuth connection
 */
export const syncTemplatesForOrg = async (orgId: string, wabaId: string): Promise<number> => {
	try {
		// Mark sync as in progress
		await updateTemplateSyncStatus(orgId, "syncing", 0, null);

		// Get active WhatsApp account for this org
		const accountResult = await db.query(
			"SELECT access_token FROM whatsapp_accounts WHERE org_id = $1 AND is_active = true LIMIT 1",
			[orgId]
		);

		if (accountResult.rowCount === 0) {
			await updateTemplateSyncStatus(orgId, "error", 0, "No active WhatsApp account found");
			throw new Error("No active WhatsApp account found");
		}

		const { access_token: encryptedToken } = accountResult.rows[0];
		const accessToken = decryptToken(encryptedToken);

		const templatesUrl = `https://graph.facebook.com/${config.graphApiVersion}/${wabaId}/message_templates`;
		const initialUrl = new URL(templatesUrl);
		initialUrl.searchParams.set("access_token", accessToken);
		initialUrl.searchParams.set(
			"fields",
			"name,status,category,language,components,id"
		);
		initialUrl.searchParams.set("limit", "200");
		logger.info("Fetching templates from Meta", { wabaId, url: templatesUrl });

		const allowedStatuses = new Set(["APPROVED", "ACTIVE", "QUALITY_PENDING"]);
		const templates: MetaTemplate[] = [];
		let nextUrl: string | null = initialUrl.toString();
		let page = 0;

		while (nextUrl) {
			page += 1;
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

			let response;
			try {
				response = await fetch(nextUrl, { signal: controller.signal });
				clearTimeout(timeoutId);
			} catch (err: any) {
				clearTimeout(timeoutId);
				if (err.name === "AbortError") {
					const timeoutError = `Template sync timeout (10s) on page ${page}`;
					await updateTemplateSyncStatus(orgId, "error", 0, timeoutError);
					throw new Error(timeoutError);
				}
				throw err;
			}

			if (!response.ok) {
				const errorText = await response.text();
				let errorDetail = "";
				try {
					const parsed = JSON.parse(errorText) as { error?: { message?: string } };
					errorDetail = parsed.error?.message || "";
				} catch {
					errorDetail = errorText;
				}
				logger.error("Meta API returned error", {
					status: response.status,
					statusText: response.statusText,
					errorBody: errorText.slice(0, 500)
				});
				const error = `Meta API error: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ""}`;
				await updateTemplateSyncStatus(orgId, "error", 0, error);
				throw new Error(error);
			}

			const data = (await response.json()) as {
				data?: MetaTemplate[];
				paging?: { next?: string };
				error?: unknown;
			};

			if (data.error) {
				const errorMsg = JSON.stringify(data.error);
				logger.error("Meta API returned error in response", { errorMsg });
				await updateTemplateSyncStatus(orgId, "error", 0, errorMsg);
				throw new Error(errorMsg);
			}

			const pageTemplates = data.data || [];
			templates.push(...pageTemplates);

			logger.info("Meta template sync page", {
				wabaId,
				page,
				pageCount: pageTemplates.length,
				hasNext: Boolean(data.paging?.next)
			});

			nextUrl = data.paging?.next || null;
		}

		// Process each template
		let insertedCount = 0;
		let updatedCount = 0;

		for (const template of templates) {
			const normalizedStatus = (template.status || "").toUpperCase();

			// Only process approved/active templates
			if (!allowedStatuses.has(normalizedStatus)) {
				logger.debug(`Skipping template: ${template.name || "unknown"} (${template.status || "unknown"})`);
				continue;
			}

			const name = template.name?.trim();
			if (!name) {
				logger.warn("Skipping template with missing name", { status: template.status });
				continue;
			}

			const language = (template.language && template.language.trim()) || "und";
			const metaTemplateId = template.id || `${name}:${language}`;
			const category = template.category || "UNKNOWN";

			try {
				// Parse components
				const components = parseComponents(template.components || []);

				// Upsert template
				const templateResult = await db.query(
					`INSERT INTO templates (
						org_id, meta_template_id, name, language, category, 
						components, status, updated_at
					) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
					ON CONFLICT (org_id, name, language) 
					DO UPDATE SET
						name = EXCLUDED.name,
						language = EXCLUDED.language,
						category = EXCLUDED.category,
						components = EXCLUDED.components,
						status = EXCLUDED.status,
						updated_at = now()
					RETURNING id`,
					[
						orgId,
						metaTemplateId,
						name,
						language,
						category,
						JSON.stringify(components),
						template.status || "UNKNOWN"
					]
				);

				if (templateResult.rowCount && templateResult.rowCount > 0) {
					insertedCount++;
				} else {
					updatedCount++;
				}
			} catch (err: any) {
				logger.warn("Failed to sync template", {
					templateName: template.name,
					error: err.message
				});
			}
		}

		const totalSynced = insertedCount + updatedCount;

		logger.info("Template sync completed", {
			wabaId,
			inserted: insertedCount,
			updated: updatedCount
		});

		// Mark sync as successful
		await updateTemplateSyncStatus(orgId, "success", totalSynced, null);

		return totalSynced;
	} catch (error: any) {
		logger.error("Template sync failed", {
			error: error.message,
			orgId,
			wabaId
		});
		throw error;
	}
};

/**
 * Parse Meta template components into a more usable format
 */
function parseComponents(components: any[]): TemplateComponent[] {
	return components
		.map((component) => {
			if (component.type === "HEADER") {
				return {
					type: "HEADER",
					format: component.format || "TEXT",
					text: component.text
				};
			}

			if (component.type === "BODY") {
				return {
					type: "BODY",
					text: component.text
				};
			}

			if (component.type === "FOOTER") {
				return {
					type: "FOOTER",
					text: component.text
				};
			}

			if (component.type === "BUTTONS") {
				return {
					type: "BUTTONS",
					buttons: (component.buttons || []).map((btn: any) => ({
						type: btn.type,
						text: btn.text,
						url: btn.url,
						phone_number: btn.phone_number
					}))
				};
			}

			return null;
		})
		.filter((c) => c !== null) as TemplateComponent[];
}

/**
 * Get all APPROVED templates for an organization
 * Exposed to campaigns UI
 */
export const getApprovedTemplates = async (
	orgId: string
): Promise<Array<{ id: string; name: string; language: string; category: string; components: TemplateComponent[] }>> => {
	try {
		const result = await db.query(
			`SELECT id, name, language, category, components 
			 FROM templates 
			 WHERE org_id = $1 AND status IN ('APPROVED', 'ACTIVE', 'QUALITY_PENDING')
			 ORDER BY name ASC`,
			[orgId]
		);

		return result.rows.map((row) => ({
			id: row.id,
			name: row.name,
			language: row.language,
			category: row.category,
			components: Array.isArray(row.components) ? row.components : JSON.parse(row.components || "[]")
		}));
	} catch (error: any) {
		logger.error("Failed to get approved templates", {
			error: error.message,
			orgId
		});
		throw error;
	}
};

/**
 * Manually trigger template sync (called via API endpoint)
 */
export const manualSyncTemplates = async (
	orgId: string
): Promise<{ success: boolean; count: number; message: string }> => {
	try {
		// Get WABA ID from active account
		const accountResult = await db.query(
			"SELECT waba_id FROM whatsapp_accounts WHERE org_id = $1 AND is_active = true LIMIT 1",
			[orgId]
		);

		if (accountResult.rowCount === 0) {
			return {
				success: false,
				count: 0,
				message: "No active WhatsApp account connected"
			};
		}

		const { waba_id } = accountResult.rows[0];
		const count = await syncTemplatesForOrg(orgId, waba_id);

		return {
			success: true,
			count,
			message: `Synced ${count} templates`
		};
	} catch (error: any) {
		logger.error("Manual template sync failed", {
			error: error.message,
			orgId
		});
		return {
			success: false,
			count: 0,
			message: `Sync failed: ${error.message}`
		};
	}
};
