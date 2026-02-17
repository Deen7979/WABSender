import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { broadcastToOrg } from "../websocket/hub.js";
import { sendMessage } from "../services/messageService.js";

export const conversationsRouter = Router();

// GET /conversations - List all conversations for org with pagination
conversationsRouter.get("/", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	
	// Validate orgId exists
	if (!orgId) {
		console.error('[Conversations] Missing orgId in auth payload', { auth: req.auth });
		return res.status(400).json({ error: "Invalid org context" });
	}
	
	const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
	const offset = parseInt(req.query.offset as string) || 0;

	try {
		const result = await db.query(
			`SELECT c.id, c.contact_id, c.last_message_at, c.created_at,
				co.phone_e164, co.name,
				SUM(CASE WHEN cp.user_id = $2 THEN cp.unread_count ELSE 0 END) as unread_count
			 FROM conversations c
			 LEFT JOIN contacts co ON c.contact_id = co.id
			 LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
			 WHERE c.org_id = $1
			 GROUP BY c.id, co.id
			 ORDER BY c.last_message_at DESC NULLS LAST
			 LIMIT $3 OFFSET $4`,
			[orgId, req.auth!.userId, limit, offset]
		);

		const countResult = await db.query(
			"SELECT COUNT(*) as count FROM conversations WHERE org_id = $1",
			[orgId]
		);

		return res.json({
			conversations: result.rows,
			total: parseInt(countResult.rows[0].count),
			limit,
			offset,
		});
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// GET /conversations/:id - Get conversation details
conversationsRouter.get("/:id", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const conversationId = req.params.id;

	if (!orgId) {
		return res.status(400).json({ error: "Invalid org context" });
	}

	try {
		const result = await db.query(
			`SELECT c.id, c.contact_id, c.last_message_at, c.created_at,
				co.phone_e164, co.name
			 FROM conversations c
			 LEFT JOIN contacts co ON c.contact_id = co.id
			 WHERE c.id = $1 AND c.org_id = $2`,
			[conversationId, orgId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		return res.json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// GET /conversations/:id/messages - Get paginated message history
conversationsRouter.get("/:id/messages", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const conversationId = req.params.id;

	if (!orgId) {
		return res.status(400).json({ error: "Invalid org context" });
	}

	const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
	const offset = parseInt(req.query.offset as string) || 0;

	try {
		// Verify conversation belongs to org
		const convResult = await db.query(
			"SELECT id FROM conversations WHERE id = $1 AND org_id = $2",
			[conversationId, orgId]
		);

		if (convResult.rowCount === 0) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		// Get message history
		const result = await db.query(
			`SELECT id, direction, body, status, meta_message_id, created_at
			 FROM messages
			 WHERE conversation_id = $1
			 ORDER BY created_at DESC
			 LIMIT $2 OFFSET $3`,
			[conversationId, limit, offset]
		);

		const countResult = await db.query(
			"SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1",
			[conversationId]
		);

		// Mark conversation as read for this user
		await db.query(
			"UPDATE conversation_participants SET last_viewed_at = NOW(), unread_count = 0 WHERE conversation_id = $1 AND user_id = $2",
			[conversationId, req.auth!.userId]
		);

		return res.json({
			messages: result.rows.reverse(),
			total: parseInt(countResult.rows[0].count),
			limit,
			offset,
		});
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /conversations/:id/reply - Send manual reply (text or template)
conversationsRouter.post("/:id/reply", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const conversationId = req.params.id;
	const { type, templateId, text, variables, mediaUrl } = req.body as {
		type?: string;
		templateId?: string;
		text?: string;
		variables?: Record<string, string>;
		mediaUrl?: string;
	};

	if (!type || (type === "template" && !templateId) || (type === "text" && !text)) {
		return res.status(400).json({ error: "Invalid reply payload" });
	}

	try {
		// Get conversation and contact
		const convResult = await db.query(
			`SELECT c.id, c.contact_id, co.phone_e164
			 FROM conversations c
			 LEFT JOIN contacts co ON c.contact_id = co.id
			 WHERE c.id = $1 AND c.org_id = $2`,
			[conversationId, orgId]
		);

		if (convResult.rowCount === 0) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		const { contact_id: contactId, phone_e164: phoneNumber } = convResult.rows[0];

		// Check opt-in status
		const optInResult = await db.query(
			`SELECT COUNT(*) as count FROM opt_in_events
			 WHERE org_id = $1 AND contact_id = $2 AND event_type = 'opt_in'`,
			[orgId, contactId]
		);

		if (parseInt(optInResult.rows[0].count) === 0) {
			return res.status(403).json({ error: "Contact has not opted in" });
		}

		// Get WhatsApp account
		const accountResult = await db.query(
			"SELECT phone_number_id FROM whatsapp_accounts WHERE org_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1",
			[orgId]
		);

		if (accountResult.rowCount === 0) {
			return res.status(400).json({ error: "No WhatsApp account configured" });
		}

		const { phone_number_id: phoneNumberId } = accountResult.rows[0];

		// Send message using message service
		const sendResult = await sendMessage({
			orgId,
			contactId,
			conversationId,
			phoneNumberId,
			recipientPhoneE164: phoneNumber,
			templateId: type === "template" ? templateId : undefined,
			messageBody: type === "text" ? text : undefined,
			templateParams: type === "template" ? variables : undefined,
			retentionPolicy: "manual_reply",
		});

		if (!sendResult.success) {
			return res.status(400).json({ error: sendResult.error });
		}

		return res.json({ 
			id: sendResult.messageId, 
			meta_message_id: sendResult.metaMessageId 
		});
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /conversations/:id/read - Mark conversation as read
conversationsRouter.post("/:id/read", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const conversationId = req.params.id;

	try {
		const result = await db.query(
			`UPDATE conversation_participants
			 SET last_viewed_at = NOW(), unread_count = 0
			 WHERE conversation_id = $1 AND user_id = $2
			 RETURNING conversation_id`,
			[conversationId, req.auth!.userId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		return res.json({ conversationId });
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /conversations/:id/close - Close conversation
conversationsRouter.post("/:id/close", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const conversationId = req.params.id;
	const { autoReopenOnReply } = req.body as { autoReopenOnReply?: boolean };

	try {
		const result = await db.query(
			`UPDATE conversation_participants
			 SET status = 'closed', resolved_at = NOW()
			 WHERE conversation_id = $1
			 RETURNING conversation_id`,
			[conversationId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		// Broadcast update
		broadcastToOrg(orgId, "conversation:closed", {
			conversationId,
			autoReopenOnReply: autoReopenOnReply !== false,
		});

		return res.json({ conversationId, status: "closed" });
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /conversations/:id/archive - Archive conversation
conversationsRouter.post("/:id/archive", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const conversationId = req.params.id;

	try {
		const result = await db.query(
			`UPDATE conversation_participants
			 SET status = 'archived'
			 WHERE conversation_id = $1
			 RETURNING conversation_id`,
			[conversationId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		return res.json({ conversationId, status: "archived" });
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});
