import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { broadcastToOrg } from "../websocket/hub.js";
import { sendMessage } from "../services/messageService.js";
import { logger } from "../utils/logger.js";

export const messagesRouter = Router();

/**
 * POST /messages/send
 * Send message to contact
 * 
 * Phase 4.7: Foundation for outbound messaging
 * - Supports template-based messages (APPROVED templates only)
 * - Validates customer care window for free text
 * - Stores message and broadcasts via WebSocket
 * 
 * Phase 4.8+: UI will be added with template selection
 */
messagesRouter.post("/send", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const { contactId, templateId, variables, messageBody, mediaUrl } = req.body as {
		contactId?: string;
		templateId?: string;
		variables?: Record<string, string>;
		messageBody?: string;
		mediaUrl?: string;
	};

	if (!contactId) {
		return res.status(400).json({ error: "contactId required" });
	}

	// Must have either template or message body
	if (!templateId && !messageBody) {
		return res.status(400).json({ error: "Either templateId or messageBody required" });
	}

	try {
		// Get contact
		const contactResult = await db.query(
			"SELECT phone_e164, id FROM contacts WHERE id = $1 AND org_id = $2",
			[contactId, orgId]
		);
		if (contactResult.rowCount === 0) {
			return res.status(404).json({ error: "Contact not found" });
		}
		const contactPhone = contactResult.rows[0].phone_e164;

		// Get or create conversation
		const conversationResult = await db.query(
			"INSERT INTO conversations (org_id, contact_id, last_message_at) VALUES ($1, $2, now()) ON CONFLICT (org_id, contact_id) DO UPDATE SET last_message_at = now() RETURNING id",
			[orgId, contactId]
		);
		const conversationId = conversationResult.rows[0].id;

		// Add current user as participant
		await db.query(
			"INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT (conversation_id, user_id) DO NOTHING",
			[conversationId, req.auth!.userId]
		);

		// Get WhatsApp account
		const accountResult = await db.query(
			"SELECT phone_number_id FROM whatsapp_accounts WHERE org_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1",
			[orgId]
		);
		if (accountResult.rowCount === 0) {
			return res.status(400).json({ error: "No WhatsApp account configured for org" });
		}
		const phoneNumberId = accountResult.rows[0].phone_number_id;

		// Phase 4.7: Use messageService to validate and prepare message
		const sendResult = await sendMessage({
			orgId,
			contactId,
			conversationId,
			phoneNumberId,
			recipientPhoneE164: contactPhone,
			templateId,
			messageBody,
			templateParams: variables,
		});

		if (!sendResult.success) {
			return res.status(400).json({ error: sendResult.error });
		}

		// Get message details for response
		const messageResult = await db.query(
			"SELECT id, status, created_at FROM messages WHERE id = $1",
			[sendResult.messageId]
		);

		// Broadcast real-time update
		broadcastToOrg(orgId, "message:received", {
			messageId: sendResult.messageId,
			conversationId,
			contactId,
			contactName: contactResult.rows[0].name || contactPhone,
			phoneNumber: contactPhone,
			body: messageBody || `[Template: ${templateId}]`,
			timestamp: new Date().toISOString(),
		});

		return res.status(201).json({
			messageId: sendResult.messageId,
			metaMessageId: sendResult.metaMessageId,
			conversationId,
			status: "sent",
		});
	} catch (err: any) {
		logger.error("[Messages] Error sending message:", err);
		return res.status(500).json({ error: err.message || "Failed to send message" });
	}
});
