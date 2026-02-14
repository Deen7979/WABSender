import { db } from "../../db/index.js";
import { whatsappPost } from "../whatsapp/client.js";
import { broadcastToOrg } from "../../websocket/hub.js";
import { isWithinBusinessHours, logOutOfHoursMessage } from "./businessHours.js";

interface AutomationRule {
	id: string;
	org_id: string;
	name: string;
	trigger_type: string;
	trigger_config: Record<string, any>;
	action_type: string;
	action_config: Record<string, any>;
	priority: number;
}

interface AutomationContext {
	orgId: string;
	contactId: string;
	conversationId: string;
	messageId: string;
	messageBody: string;
	phoneNumberId: string;
	contactPhone: string;
}

/**
 * Check if contact has received an auto-reply in the last hour (rate limiting)
 */
async function isRateLimited(contactId: string): Promise<boolean> {
	const result = await db.query(
		`SELECT COUNT(*) as count
		 FROM automation_logs
		 WHERE message_id IN (
			SELECT id FROM messages WHERE contact_id = $1
		 )
		 AND triggered_at > NOW() - INTERVAL '1 hour'`,
		[contactId]
	);
	return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Find matching automation rules for the given message
 * Returns the highest priority matching rule (lower number = higher priority)
 */
async function findMatchingRule(
	orgId: string,
	messageBody: string
): Promise<AutomationRule | null> {
	// Get all active keyword-based automation rules for this org, ordered by priority
	const result = await db.query(
		`SELECT id, org_id, name, trigger_type, trigger_config, action_type, action_config, priority
		 FROM automation_rules
		 WHERE org_id = $1
		   AND trigger_type = 'keyword'
		   AND is_active = true
		 ORDER BY priority ASC, created_at ASC`,
		[orgId]
	);

	if (result.rowCount === 0) {
		return null;
	}

	const normalizedBody = messageBody.trim().toLowerCase();

	// Find first matching rule (highest priority)
	for (const rule of result.rows) {
		const keywords = rule.trigger_config?.keywords as string[] | undefined;
		if (!keywords || keywords.length === 0) {
			continue;
		}

		// Case-insensitive keyword matching (exact word match)
		const matched = keywords.some((keyword) => {
			const normalizedKeyword = keyword.trim().toLowerCase();
			// Match whole word or if message body equals keyword
			const regex = new RegExp(`\\b${normalizedKeyword}\\b`, 'i');
			return regex.test(messageBody) || normalizedBody === normalizedKeyword;
		});

		if (matched) {
			return rule as AutomationRule;
		}
	}

	return null;
}

/**
 * Execute the automation action (send_template or send_text)
 */
async function executeAction(
	rule: AutomationRule,
	context: AutomationContext
): Promise<{ success: boolean; metaMessageId?: string; error?: string }> {
	try {
		let payload: Record<string, any>;

		if (rule.action_type === "send_template") {
			const templateName = rule.action_config?.template_name as string | undefined;
			const templateLanguage = rule.action_config?.template_language as string | undefined;
			const templateParams = rule.action_config?.template_params as string[] | undefined;

			if (!templateName || !templateLanguage) {
				return { success: false, error: "Missing template_name or template_language in action_config" };
			}

			const components: any[] = [];
			if (templateParams && templateParams.length > 0) {
				components.push({
					type: "body",
					parameters: templateParams.map((param) => ({ type: "text", text: param })),
				});
			}

			payload = {
				messaging_product: "whatsapp",
				to: context.contactPhone,
				type: "template",
				template: {
					name: templateName,
					language: { code: templateLanguage },
					components: components.length > 0 ? components : undefined,
				},
			};
		} else if (rule.action_type === "send_text") {
			const textMessage = rule.action_config?.message as string | undefined;
			if (!textMessage) {
				return { success: false, error: "Missing message in action_config" };
			}

			payload = {
				messaging_product: "whatsapp",
				to: context.contactPhone,
				type: "text",
				text: { body: textMessage },
			};
		} else {
			return { success: false, error: `Unsupported action_type: ${rule.action_type}` };
		}

		// Send via WhatsApp
		const sendResult = await whatsappPost<{ messages: Array<{ id: string }> }>(
			`/${context.phoneNumberId}/messages`,
			payload
		);

		const metaMessageId = sendResult.messages?.[0]?.id;

		// Store outbound message in messages table
		await db.query(
			`INSERT INTO messages (
				org_id, conversation_id, contact_id, direction,
				body, meta_message_id, status
			)
			VALUES ($1, $2, $3, 'outbound', $4, $5, 'sent')`,
			[
				context.orgId,
				context.conversationId,
				context.contactId,
				JSON.stringify(payload),
				metaMessageId,
			]
		);

		return { success: true, metaMessageId };
	} catch (err: any) {
		return { success: false, error: err.message };
	}
}

/**
 * Log automation execution to automation_logs table
 */
async function logAutomation(
	rule: AutomationRule,
	context: AutomationContext,
	result: { success: boolean; metaMessageId?: string; error?: string }
): Promise<void> {
	await db.query(
		`INSERT INTO automation_logs (
			org_id, automation_rule_id, message_id,
			action_taken, result, error_message
		)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		[
			context.orgId,
			rule.id,
			context.messageId,
			rule.action_type,
			result.success ? "success" : "failed",
			result.error || null,
		]
	);
}

/**
 * Main entry point for automation engine
 * Called from webhook handler when inbound message is received
 */
export async function processAutomation(context: AutomationContext): Promise<void> {
	try {
		// Skip if message body is empty
		if (!context.messageBody || context.messageBody.trim() === "") {
			return;
		}

		// Check business hours status
		const businessHoursStatus = await isWithinBusinessHours(context.orgId);
		
		if (!businessHoursStatus.isOpen) {
			// Outside business hours
			console.log(
				`[Automation] Message received outside business hours for contact ${context.contactId}`
			);
			
			// Log out-of-hours message for potential batch processing
			await logOutOfHoursMessage(
				context.orgId,
				context.contactId,
				context.conversationId,
				context.messageId,
				context.messageBody
			);

			// Broadcast out-of-hours event for UI
			broadcastToOrg(context.orgId, "message:out_of_hours", {
				messageId: context.messageId,
				conversationId: context.conversationId,
				contactId: context.contactId,
				contactPhone: context.contactPhone,
				body: context.messageBody,
				timezone: businessHoursStatus.timezone,
				currentTime: businessHoursStatus.currentTime,
				dayOfWeek: businessHoursStatus.dayOfWeek,
				timestamp: new Date().toISOString(),
			});

			return; // Don't process automations outside business hours
		}

		// Rate limiting check
		const rateLimited = await isRateLimited(context.contactId);
		if (rateLimited) {
			console.log(
				`[Automation] Rate limited for contact ${context.contactId} - skipping automation`
			);
			return;
		}

		// Find matching automation rule
		const matchedRule = await findMatchingRule(context.orgId, context.messageBody);
		if (!matchedRule) {
			return; // No matching rule
		}

		console.log(
			`[Automation] Matched rule "${matchedRule.name}" (priority ${matchedRule.priority}) for message: "${context.messageBody}"`
		);

		// Execute automation action
		const result = await executeAction(matchedRule, context);

		// Log automation execution
		await logAutomation(matchedRule, context, result);

		// Broadcast WebSocket event
		broadcastToOrg(context.orgId, "automation:triggered", {
			automationRuleId: matchedRule.id,
			automationName: matchedRule.name,
			conversationId: context.conversationId,
			contactId: context.contactId,
			triggerMessage: context.messageBody,
			actionType: matchedRule.action_type,
			success: result.success,
			error: result.error,
			timestamp: new Date().toISOString(),
		});

		if (result.success) {
			console.log(
				`[Automation] Successfully executed "${matchedRule.name}" for contact ${context.contactId}`
			);
		} else {
			console.error(
				`[Automation] Failed to execute "${matchedRule.name}": ${result.error}`
			);
		}
	} catch (err: any) {
		console.error(`[Automation] Error processing automation:`, err);
		// Don't throw - automation failures should not block webhook processing
	}
}
