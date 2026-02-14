/**
 * WhatsApp Webhook Verification & Message Handling
 * 
 * Implements HMAC-SHA256 verification for webhook authenticity
 * Handles message events, status updates, and template changes
 */

import crypto from "crypto";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Verify webhook signature from Meta
 * Returns true if signature is valid, false otherwise
 */
export const verifyWebhookSignature = (
	body: string,
	signature: string | undefined
): boolean => {
	if (!signature) {
		logger.warn("Missing webhook signature");
		return false;
	}

	// Signature format: "sha1=<hash>"
	const [algo, hash] = signature.split("=");
	
	if (algo !== "sha256") {
		logger.warn("Invalid signature algorithm", { algo });
		return false;
	}

	// Create HMAC using Meta app secret
	const expectedHash = crypto
		.createHmac("sha256", config.metaAppSecret)
		.update(body)
		.digest("hex");

	// Compare hashes (timing-safe comparison)
	const isValid = crypto.timingSafeEqual(
		Buffer.from(hash),
		Buffer.from(expectedHash)
	);

	if (!isValid) {
		logger.warn("Invalid webhook signature", {
			received: hash.substring(0, 10) + "...",
			expected: expectedHash.substring(0, 10) + "..."
		});
	}

	return isValid;
};

/**
 * Handle incoming webhook events from Meta
 */
export const handleWebhookEvent = async (
	event: any
): Promise<{
	processed: boolean;
	message?: string;
}> => {
	try {
		// Event structure from Meta
		const { type, entry } = event;

		if (type !== "whatsapp_business_account") {
			logger.debug("Non-WhatsApp event ignored", { type });
			return { processed: false, message: "Not a WhatsApp event" };
		}

		for (const item of entry || []) {
			const { id: wabaId, changes } = item;

			for (const change of changes || []) {
				const { field, value } = change;

				if (field === "messages") {
					await handleMessageEvents(wabaId, value);
				} else if (field === "message_status") {
					await handleStatusEvents(wabaId, value);
				} else if (field === "message_template") {
					await handleTemplateEvents(wabaId, value);
				} else {
					logger.debug("Unknown webhook field", { field, wabaId });
				}
			}
		}

		return { processed: true, message: "Event processed" };
	} catch (error: any) {
		logger.error("Webhook event processing failed", {
			error: error.message
		});
		return { processed: false, message: error.message };
	}
};

/**
 * Handle incoming messages from contacts
 * Called by handleWebhookEvent() when field === "messages"
 * 
 * Phase 4.7: Store inbound messages, create/update conversations, broadcast to UI
 */
async function handleMessageEvents(wabaId: string, value: any): Promise<void> {
	try {
		// Note: Actual message persistence logic is in webhooks.routes.ts
		// This handler can be extended for additional processing in Phase 4.8+
		// (e.g., AI classification, routing rules, etc.)
		
		const { messages = [] } = value;

		for (const message of messages) {
			const {
				id: messageId,
				from,
				timestamp,
				type: msgType,
				text,
				media,
				interactive
			} = message;

			logger.debug("Message event received", {
				messageId,
				from,
				type: msgType,
				wabaId
			});

			// Message storage and conversation management is handled in webhooks.routes.ts
			// This function can be extended for Phase 4.8+ enhancements:
			// - Message classification (intent, sentiment)
			// - Routing rule evaluation
			// - Auto-reply triggering
			// - Analytics aggregation
		}
	} catch (error: any) {
		logger.error("Failed to handle message events", {
			error: error.message,
			wabaId
		});
	}
}

/**
 * Handle message delivery status updates
 * Called by handleWebhookEvent() when field === "message_status"
 * 
 * Phase 4.7: Update message status with idempotent, forward-only progression
 * Status flow: sent → delivered → read (no backwards progression)
 */
async function handleStatusEvents(wabaId: string, value: any): Promise<void> {
	try {
		const { statuses = [] } = value;

		for (const status of statuses) {
			const { id: messageId, status: deliveryStatus, timestamp, recipient_id } = status;

			if (!messageId || !deliveryStatus) {
				logger.debug("Status event missing required fields", { status });
				continue;
			}

			logger.debug("Message status update received", {
				messageId,
				status: deliveryStatus,
				wabaId
			});

			// Status update logic is handled in webhooks.routes.ts for idempotency
			// This function can be extended for Phase 4.8+:
			// - Trigger notifications on read receipt
			// - Analytics tracking (delivery rates, time-to-read)
			// - Error retry logic for failed messages
			// - Customer SLA tracking
		}
	} catch (error: any) {
		logger.error("Failed to handle status events", {
			error: error.message,
			wabaId
		});
	}
}

/**
 * Handle template-related events
 */
async function handleTemplateEvents(wabaId: string, value: any): Promise<void> {
	try {
		const { message_template_status_update = [] } = value;

		for (const update of message_template_status_update) {
			const {
				id: templateId,
				status: templateStatus,
				event,
				message
			} = update;

			logger.info("Template status update", {
				templateId,
				status: templateStatus,
				event,
				wabaId
			});

			// TODO: In Phase 2, update template status in database
			// Status can be: APPROVED, REJECTED, PENDING_REVIEW, DISABLED, etc.
		}
	} catch (error: any) {
		logger.error("Failed to handle template events", {
			error: error.message,
			wabaId
		});
	}
}
