import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";
import { whatsappPost } from "./whatsapp/client.js";

/**
 * Phase 4.7: Outbound Messaging Service
 * 
 * Handles sending messages to contacts via WhatsApp API.
 * Enforces APPROVED template usage and 24-hour customer care window.
 * No UI for sending yet (Phase 4.8 will add reply/template selection UI).
 * 
 * Current Scope:
 * - Validate APPROVED template status
 * - Check 24-hour customer care window (from last contact message)
 * - Insert outbound message with 'sending' status
 * - Call Meta API to send message
 * - Update status based on API response
 * 
 * Phase 4.8+ Extensions:
 * - AI-powered suggestion of relevant templates
 * - Quick reply UI with template shortcuts
 * - Media attachment support (images, documents)
 * - Message scheduling/drafts
 * - Delivery analytics and optimization
 * - Error recovery and retry logic
 */

interface SendMessageParams {
	orgId: string;
	contactId: string;
	conversationId: string;
	phoneNumberId: string;
	recipientPhoneE164: string;
	templateId?: string; // Template ID if using template
	messageBody?: string; // Free text if not using template
	templateParams?: Record<string, string>; // Parameters for template variables
}

interface SendMessageResult {
	success: boolean;
	messageId: string;
	metaMessageId?: string;
	error?: string;
}

type TemplateMeta = {
	name: string;
	language: string;
	status: string;
};

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 750;
const MAX_RETRY_DELAY_MS = 6000;

/**
 * Check if recipient is within 24-hour customer care window
 * 
 * WhatsApp allows:
 * - Free-tier messages only within 24 hours of last contact message (inbound)
 * - Template messages anytime (using APPROVED templates)
 * 
 * For Phase 4.7, we enforce:
 * - APPROVED templates can be sent anytime
 * - Free text must be within 24 hours of last contact message
 * - Return window status for UI/logging
 */
async function checkCustomerCareWindow(
	contactId: string,
	orgId: string,
	useTemplate: boolean
): Promise<{ withinWindow: boolean; lastMessageAt?: string; expiresAt?: string }> {
	try {
		// If using APPROVED template, no window check needed
		if (useTemplate) {
			return { withinWindow: true };
		}

		// For free text, check last message from contact
		const result = await db.query(
			`SELECT MAX(created_at) as last_message_at
			 FROM messages
			 WHERE contact_id = $1 AND org_id = $2 AND direction = 'inbound'`,
			[contactId, orgId]
		);

		const lastMessageAt = result.rows[0]?.last_message_at as string | null;
		if (!lastMessageAt) {
			// No prior message - cannot send free text
			return {
				withinWindow: false,
				expiresAt: new Date().toISOString(), // Expired immediately
			};
		}

		const lastMessage = new Date(lastMessageAt);
		const now = new Date();
		const hoursSinceLastMessage = (now.getTime() - lastMessage.getTime()) / (1000 * 60 * 60);

		const withinWindow = hoursSinceLastMessage < 24;
		const expiresAt = new Date(lastMessage.getTime() + 24 * 60 * 60 * 1000).toISOString();

		return {
			withinWindow,
			lastMessageAt,
			expiresAt: !withinWindow ? expiresAt : undefined,
		};
	} catch (err: any) {
		logger.error("[MessageService] Error checking customer care window:", err);
		// On error, assume not within window (safe default to prevent violations)
		return { withinWindow: false };
	}
}

/**
 * Validate template status (must be approved/active)
 */
async function validateTemplate(
	templateId: string,
	orgId: string
): Promise<{ valid: boolean; template?: TemplateMeta; error?: string }> {
	try {
		const result = await db.query(
			`SELECT id, name, language, status
			 FROM templates
			 WHERE id = $1 AND org_id = $2`,
			[templateId, orgId]
		);

		if (result.rowCount === 0) {
			return { valid: false, error: "Template not found" };
		}

		const template = result.rows[0];

		const normalizedStatus = (template.status || "").toUpperCase();
		const allowedStatuses = new Set([
			"APPROVED",
			"ACTIVE",
			"ACTIVE - QUALITY_PENDING",
			"QUALITY_PENDING",
		]);

		if (!allowedStatuses.has(normalizedStatus)) {
			return {
				valid: false,
				error: `Template status is ${template.status}, must be APPROVED or ACTIVE`,
			};
		}

		return {
			valid: true,
			template: {
				name: template.name,
				language: template.language,
				status: template.status,
			},
		};
	} catch (err: any) {
		logger.error("[MessageService] Error validating template:", err);
		return { valid: false, error: "Error validating template" };
	}
}

function parseWhatsAppStatusCode(errorMessage: string): number | null {
	const match = errorMessage.match(/WhatsApp API error: (\d{3})/i);
	return match ? Number(match[1]) : null;
}

function isTransientError(errorMessage: string): boolean {
	const statusCode = parseWhatsAppStatusCode(errorMessage);
	if (statusCode) {
		return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
	}
	return /timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(errorMessage);
}

function isPermanentError(errorMessage: string): boolean {
	const statusCode = parseWhatsAppStatusCode(errorMessage);
	if (statusCode) {
		return statusCode >= 400 && statusCode < 500 && statusCode !== 429;
	}
	return /invalid|template|parameter|unsupported/i.test(errorMessage);
}

function buildTemplateParameters(templateParams?: Record<string, string>) {
	if (!templateParams || Object.keys(templateParams).length === 0) {
		return [] as Array<{ type: "text"; text: string }>;
	}
	const entries = Object.entries(templateParams);
	const sortedEntries = entries.sort(([a], [b]) => {
		const aNum = Number(a);
		const bNum = Number(b);
		if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
			return aNum - bNum;
		}
		return a.localeCompare(b);
	});
	return sortedEntries.map(([, value]) => ({ type: "text" as const, text: value }));
}

async function sendMessageViaMetaAPI(params: {
	phoneNumberId: string;
	recipientPhoneE164: string;
	messageBody?: string;
	template?: TemplateMeta;
	templateParams?: Record<string, string>;
}): Promise<string> {
	const { phoneNumberId, recipientPhoneE164, messageBody, template, templateParams } = params;

	if (template) {
		const parameters = buildTemplateParameters(templateParams);
		const payload = {
			messaging_product: "whatsapp",
			to: recipientPhoneE164,
			type: "template",
			template: {
				name: template.name,
				language: { code: template.language },
				components: parameters.length > 0 ? [{ type: "body", parameters }] : [],
			},
		};

		const result = await whatsappPost<{ messages: Array<{ id: string }> }>(
			`/${phoneNumberId}/messages`,
			payload
		);

		const metaMessageId = result.messages?.[0]?.id;
		if (!metaMessageId) {
			throw new Error("Meta API response missing message id");
		}
		return metaMessageId;
	}

	if (!messageBody) {
		throw new Error("Message body required for text messages");
	}

	const payload = {
		messaging_product: "whatsapp",
		to: recipientPhoneE164,
		type: "text",
		text: { body: messageBody },
	};

	const result = await whatsappPost<{ messages: Array<{ id: string }> }>(
		`/${phoneNumberId}/messages`,
		payload
	);

	const metaMessageId = result.messages?.[0]?.id;
	if (!metaMessageId) {
		throw new Error("Meta API response missing message id");
	}
	return metaMessageId;
}

async function sendWithRetry(params: {
	messageId: string;
	phoneNumberId: string;
	recipientPhoneE164: string;
	messageBody?: string;
	template?: TemplateMeta;
	templateParams?: Record<string, string>;
}): Promise<string> {
	const { messageId, phoneNumberId, recipientPhoneE164, messageBody, template, templateParams } = params;
	let attempt = 0;
	let lastError: string | null = null;

	while (attempt <= MAX_RETRIES) {
		try {
			if (attempt > 0) {
				logger.warn("[MessageService] Retrying Meta send", { messageId, attempt });
			}

			return await sendMessageViaMetaAPI({
				phoneNumberId,
				recipientPhoneE164,
				messageBody,
				template,
				templateParams,
			});
		} catch (err: any) {
			lastError = err.message || "Meta API send failed";
			const errorMessage = lastError || "Meta API send failed";
			const permanent = isPermanentError(errorMessage);
			const transient = isTransientError(errorMessage);

			await db.query(
				`UPDATE messages
				 SET retry_count = retry_count + 1,
					 last_error = $1,
					 last_error_at = now()
				 WHERE id = $2`,
				[errorMessage, messageId]
			);

			if (permanent) {
				throw err;
			}

			if (!transient || attempt === MAX_RETRIES) {
				throw err;
			}

			const delay = Math.min(
				BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
				MAX_RETRY_DELAY_MS
			);
			await new Promise((resolve) => setTimeout(resolve, delay));
			attempt += 1;
		}
	}

	throw new Error(lastError || "Meta API send failed");
}

/**
 * Send message to contact
 * 
 * Flow:
 * 1. Validate template if provided
 * 2. Check customer care window for free text
 * 3. Insert message with 'sending' status
 * 4. Call Meta Graph API to send
 * 5. Update status based on API response
 * 6. Broadcast via WebSocket
 * 
 * Idempotency:
 * - Each send attempt creates a new message record
 * - Retries use the same messageId but create new attempt records
 * - Phase 4.8+ will add retry logic with backoff
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
	const {
		orgId,
		contactId,
		conversationId,
		phoneNumberId,
		recipientPhoneE164,
		templateId,
		messageBody,
		templateParams,
	} = params;

	try {
		// Validate inputs
		if (!orgId || !contactId || !conversationId || !phoneNumberId || !recipientPhoneE164) {
			return {
				success: false,
				messageId: "",
				error: "Missing required parameters",
			};
		}

		// Must provide either template or message body
		if (!templateId && !messageBody) {
			return {
				success: false,
				messageId: "",
				error: "Must provide either templateId or messageBody",
			};
		}

		const useTemplate = !!templateId;
		let templateMeta: TemplateMeta | undefined;

		// Phase 4.7: Validate template
		if (useTemplate && templateId) {
			const templateValidation = await validateTemplate(templateId, orgId);
			if (!templateValidation.valid) {
				return {
					success: false,
					messageId: "",
					error: templateValidation.error,
				};
			}
			templateMeta = templateValidation.template;
		}

		// Phase 4.7: Check customer care window
		const windowCheck = await checkCustomerCareWindow(contactId, orgId, useTemplate);
		if (!windowCheck.withinWindow) {
			return {
				success: false,
				messageId: "",
				error: `Outside 24-hour customer care window. Window expires at: ${windowCheck.expiresAt}`,
			};
		}

		// Insert outbound message with 'sending' status
		const insertResult = await db.query(
			`INSERT INTO messages (
				org_id, conversation_id, contact_id,
				direction, body, status,
				template_id, retention_policy, template_params
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id`,
			[
				orgId,
				conversationId,
				contactId,
				"outbound",
				messageBody || `[Template: ${templateId}]`,
				"sending",
				templateId || null,
				"conversation",
				templateParams ? JSON.stringify(templateParams) : null,
			]
		);

		const messageId = insertResult.rows[0].id as string;

		logger.info("[MessageService] Message created for sending", {
			messageId,
			conversationId,
			contactId,
		});

		// Phase 4.8: Call Meta Graph API to send (with retries)
		let metaMessageId: string | null = null;
		try {
			metaMessageId = await sendWithRetry({
				messageId,
				phoneNumberId,
				recipientPhoneE164,
				messageBody,
				template: templateMeta,
				templateParams,
			});

			await db.query(
				`UPDATE messages SET status = $1, meta_message_id = $2 WHERE id = $3`,
				["sent", metaMessageId, messageId]
			);

			logger.info("[MessageService] Message sent via Meta API", {
				messageId,
				metaMessageId,
			});
		} catch (err: any) {
			const errorMessage = err.message || "Meta API send failed";
			await db.query(
				`UPDATE messages SET status = $1, last_error = $2, last_error_at = now() WHERE id = $3`,
				["failed", errorMessage, messageId]
			);

			logger.error("[MessageService] Meta API send failed", {
				messageId,
				error: errorMessage,
			});

			return {
				success: false,
				messageId,
				error: errorMessage,
			};
		}

		return {
			success: true,
			messageId,
			metaMessageId: metaMessageId || undefined,
		};
	} catch (err: any) {
		logger.error("[MessageService] Error sending message:", err);
		return {
			success: false,
			messageId: "",
			error: err.message || "Failed to send message",
		};
	}
}

/**
 * Get message sending history for a contact
 * Used to determine if we're within customer care window
 */
export async function getMessageHistory(
	contactId: string,
	orgId: string,
	limit: number = 10
): Promise<Array<{ id: string; direction: string; created_at: string }>> {
	try {
		const result = await db.query(
			`SELECT id, direction, created_at
			 FROM messages
			 WHERE contact_id = $1 AND org_id = $2
			 ORDER BY created_at DESC
			 LIMIT $3`,
			[contactId, orgId, limit]
		);

		return result.rows;
	} catch (err: any) {
		logger.error("[MessageService] Error getting message history:", err);
		return [];
	}
}

/**
 * Phase 4.8+ Extension: Retry failed message
 * Will implement exponential backoff and retry logic
 * 
 * For Phase 4.7, this is a placeholder for future implementation
 */
export async function retryFailedMessage(
	messageId: string,
	orgId: string
): Promise<SendMessageResult> {
	try {
		const result = await db.query(
			`SELECT m.id, m.org_id, m.contact_id, m.conversation_id, m.body, m.template_id, m.status,
				m.template_params, wa.phone_number_id, c.phone_e164, t.name as template_name, t.language as template_language
			 FROM messages m
			 JOIN contacts c ON c.id = m.contact_id
			 JOIN whatsapp_accounts wa ON wa.org_id = m.org_id AND wa.is_active = true
			 LEFT JOIN templates t ON t.id = m.template_id
			 WHERE m.id = $1 AND m.org_id = $2
			 LIMIT 1`,
			[messageId, orgId]
		);

		if (result.rowCount === 0) {
			return { success: false, messageId, error: "Message not found" };
		}

		const row = result.rows[0];
		if (row.status !== "failed") {
			return { success: false, messageId, error: "Only failed messages can be retried" };
		}

		const templateMeta = row.template_id
			? { name: row.template_name, language: row.template_language, status: "APPROVED" }
			: undefined;
		const parsedTemplateParams = row.template_params
			? (typeof row.template_params === "string" ? JSON.parse(row.template_params) : row.template_params)
			: undefined;

		const metaMessageId = await sendWithRetry({
			messageId,
			phoneNumberId: row.phone_number_id,
			recipientPhoneE164: row.phone_e164,
			messageBody: row.template_id ? undefined : row.body,
			template: templateMeta,
			templateParams: parsedTemplateParams,
		});

		await db.query(
			`UPDATE messages SET status = $1, meta_message_id = $2 WHERE id = $3`,
			["sent", metaMessageId, messageId]
		);

		return { success: true, messageId, metaMessageId };
	} catch (err: any) {
		logger.error("[MessageService] Retry failed", { messageId, error: err.message });
		return { success: false, messageId, error: err.message || "Retry failed" };
	}
}
