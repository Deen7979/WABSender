import { Router } from "express";
import { config } from "../config/index.js";
import { db } from "../db/index.js";
import { broadcastToOrg } from "../websocket/hub.js";
import { processAutomation } from "../services/automation/engine.js";
import { isWithinBusinessHours } from "../services/automation/businessHours.js";
import { verifyWebhookSignature, handleWebhookEvent } from "../services/webhookHandler.js";
import { logger } from "../utils/logger.js";

export const webhooksRouter = Router();

/**
 * GET /webhooks/whatsapp
 * Webhook verification endpoint (Meta webhook setup)
 */
webhooksRouter.get("/whatsapp", async (req, res) => {
	const hubQuery = typeof req.query.hub === "object" && req.query.hub !== null ? req.query.hub as Record<string, unknown> : null;
	const mode = req.query["hub.mode"] ?? hubQuery?.mode;
	const token = req.query["hub.verify_token"] ?? hubQuery?.verify_token;
	const challenge = req.query["hub.challenge"] ?? hubQuery?.challenge;

	if (mode === "subscribe" && token === config.whatsappWebhookVerifyToken) {
		logger.info("Webhook verified");
		// Mark webhook verified for all active orgs (verification is app-level)
		await db.query(
			`INSERT INTO webhook_health (org_id, webhook_verified, last_webhook_timestamp, updated_at)
			 SELECT org_id, true, now(), now()
			 FROM whatsapp_accounts
			 WHERE is_active = true
			 ON CONFLICT (org_id)
			 DO UPDATE SET webhook_verified = true, last_webhook_timestamp = now(), updated_at = now()`
		);
		return res.status(200).send(challenge);
	}

	logger.warn("Webhook verification failed", { mode, tokenMatch: token === config.whatsappWebhookVerifyToken });
	return res.sendStatus(403);
});

/**
 * POST /webhooks/whatsapp
 * Main webhook receiver - handles all WhatsApp events
 * Implements HMAC-SHA256 signature verification
 */
webhooksRouter.post("/whatsapp", async (req, res) => {
	const signature = req.get("x-hub-signature-256");
	const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

	// Verify webhook signature
	if (!verifyWebhookSignature(rawBody, signature)) {
		logger.warn("Webhook signature verification failed");
		return res.sendStatus(403);
	}

	// Process webhook asynchronously
	res.sendStatus(200);

	const processWebhook = async () => {
		try {
			const body = req.body as Record<string, unknown>;
			const entry = (body["entry"] as Array<Record<string, unknown>> | undefined)?.[0];
			const changes = entry?.["changes"] as Array<Record<string, unknown>> | undefined;
			const value = changes?.[0]?.["value"] as Record<string, unknown> | undefined;

			if (!value) {
				logger.debug("Empty webhook value");
				return;
			}

			const metadata = value["metadata"] as Record<string, unknown> | undefined;
			const phoneNumberId = metadata?.["phone_number_id"] as string | undefined;
			const messages = (value["messages"] as Array<Record<string, unknown>> | undefined) || [];
			const statuses = (value["statuses"] as Array<Record<string, unknown>> | undefined) || [];

			let orgId: string | null = null;
			if (phoneNumberId) {
				const accountResult = await db.query(
					"SELECT org_id FROM whatsapp_accounts WHERE phone_number_id = $1 AND is_active = true",
					[phoneNumberId]
				);
				if ((accountResult.rowCount ?? 0) > 0) {
					orgId = accountResult.rows[0].org_id;
				}
			}

			if (!orgId) {
				logger.warn("Could not find org for phone number", { phoneNumberId });
				return;
			}

			for (const message of messages) {
				try {
					const from = message["from"] as string | undefined;
					const messageId = message["id"] as string | undefined;
					const text = (message["text"] as Record<string, unknown> | undefined)?.["body"] as string | undefined;

					if (!from || !messageId) continue;

					// Get or create contact
					const contactResult = await db.query(
						"SELECT id, name FROM contacts WHERE phone_e164 = $1 AND org_id = $2",
						[`+${from}`, orgId]
					);

					let contactId: string;
					let contactName: string | null = null;
					if ((contactResult.rowCount ?? 0) > 0) {
						contactId = contactResult.rows[0].id;
						contactName = contactResult.rows[0].name;
					} else {
						const insertedContact = await db.query(
							"INSERT INTO contacts (org_id, phone_e164) VALUES ($1, $2) RETURNING id",
							[orgId, `+${from}`]
						);
						contactId = insertedContact.rows[0].id;
					}

					// Check for duplicate message (idempotency)
					const existing = await db.query(
						"SELECT id FROM messages WHERE meta_message_id = $1",
						[messageId]
					);
					if ((existing.rowCount ?? 0) > 0) {
						continue;
					}

					// Create or update conversation (update last_message_at)
					const conversationResult = await db.query(
						"INSERT INTO conversations (org_id, contact_id, last_message_at) VALUES ($1, $2, now()) ON CONFLICT (org_id, contact_id) DO UPDATE SET last_message_at = now() RETURNING id",
						[orgId, contactId]
					);
					const conversationId = conversationResult.rows[0].id;

					// Ensure all active users are participants
					const usersResult = await db.query(
						"SELECT id FROM users WHERE org_id = $1 AND is_active = true",
						[orgId]
					);
					for (const user of usersResult.rows) {
						await db.query(
							"INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT (conversation_id, user_id) DO NOTHING",
							[conversationId, user.id]
						);
					}

					// Auto-reopen closed conversations on contact reply (Phase 3 approved behavior)
					await db.query(
						`UPDATE conversation_participants
						 SET status = 'active', resolved_at = NULL
						 WHERE conversation_id = $1 AND status IN ('closed', 'archived')`,
						[conversationId]
					);

					// Store inbound message
					const inserted = await db.query(
						"INSERT INTO messages (org_id, conversation_id, contact_id, direction, body, meta_message_id, status) VALUES ($1, $2, $3, 'inbound', $4, $5, 'received') RETURNING id",
						[orgId, conversationId, contactId, text || null, messageId]
					);

					// Check if within business hours
					const businessHoursStatus = await isWithinBusinessHours(orgId);
					
					// Increment unread count for all participants ONLY if within business hours (Phase 3.5 requirement)
					if (businessHoursStatus.isOpen) {
						await db.query(
							"UPDATE conversation_participants SET unread_count = unread_count + 1 WHERE conversation_id = $1",
							[conversationId]
						);
					} else {
						console.log(`[Webhook] Message received outside business hours for conversation ${conversationId} - unread count NOT incremented`);
					}

					// Broadcast Phase 3.2 real-time events
					broadcastToOrg(orgId, "message:received", {
						messageId: inserted.rows[0].id,
						conversationId,
						contactId,
						contactName,
						phoneNumber: `+${from}`,
						body: text || "",
						timestamp: new Date().toISOString(),
					});

					broadcastToOrg(orgId, "conversation:unread_updated", {
						conversationId,
						contactId,
						contactName,
						phoneNumber: `+${from}`,
						lastMessageAt: new Date().toISOString(),
					});

					// Phase 3.4: Process automation (keyword triggers, auto-replies, rate limiting)
					// This runs asynchronously and failures don't block webhook processing
					if (text && phoneNumberId) {
						processAutomation({
							orgId,
							contactId,
							conversationId,
							messageId: inserted.rows[0].id,
							messageBody: text,
							phoneNumberId,
							contactPhone: `+${from}`,
						}).catch((err) => {
							console.error(`[Webhook] Automation processing error:`, err);
						});
					}
				} catch (err: any) {
					logger.error("Webhook message processing failed", {
						error: err.message,
						message
					});
				}
			}

			for (const status of statuses) {
				try {
					const metaMessageId = status["id"] as string | undefined;
					const statusValue = status["status"] as string | undefined;
					if (!metaMessageId || !statusValue) continue;

					const msgResult = await db.query(
						"SELECT id, org_id, contact_id, retention_policy FROM messages WHERE meta_message_id = $1",
						[metaMessageId]
					);
					if (msgResult.rowCount === 0) continue;

					const { id: messageId, org_id: messageOrgId, contact_id: contactId, retention_policy: retentionPolicy } = msgResult.rows[0];

					const existing = await db.query(
						"SELECT id FROM message_status_events WHERE message_id = $1 AND status = $2",
						[messageId, statusValue]
					);
					if (existing.rowCount === 0) {
						await db.query(
							"INSERT INTO message_status_events (message_id, status) VALUES ($1, $2)",
							[messageId, statusValue]
						);
						await db.query("UPDATE messages SET status = $1 WHERE id = $2", [statusValue, messageId]);
					}

					// If this is a campaign message, update campaign_recipients status
					if (retentionPolicy === 'campaign') {
						const recipientResult = await db.query(
							`SELECT cr.recipient_id, cr.campaign_id
							 FROM campaign_recipients cr
							 WHERE cr.contact_id = $1
							   AND cr.status IN ('sent', 'delivered')
							 ORDER BY cr.sent_at DESC
							 LIMIT 1`,
							[contactId]
						);

						if ((recipientResult.rowCount ?? 0) > 0) {
							const { recipient_id: recipientId, campaign_id: campaignId } = recipientResult.rows[0];

							// Update campaign_recipients status (idempotent)
							// Only allow progression: sent -> delivered -> read
							const statusProgression: Record<string, string[]> = {
								sent: ['delivered', 'read', 'failed'],
								delivered: ['read'],
							};

							const currentStatusResult = await db.query(
								'\tSELECT status FROM campaign_recipients WHERE recipient_id = $1',
								[recipientId]
							);
							const currentStatus = currentStatusResult.rows[0]?.status;

							if (currentStatus && statusProgression[currentStatus]?.includes(statusValue)) {
								await db.query(
									'UPDATE campaign_recipients SET status = $1 WHERE recipient_id = $2',
									[statusValue, recipientId]
								);

								// Broadcast realtime update for campaign recipient status change
								broadcastToOrg(messageOrgId, 'campaign:recipient_status', {
									campaign_id: campaignId,
									recipient_id: recipientId,
									status: statusValue,
								});
							}
						}
					}

					broadcastToOrg(messageOrgId, "message:status", {
						messageId,
						status: statusValue
					});
				} catch (err: any) {
					logger.error("Webhook status processing failed", {
						error: err.message,
						status
					});
				}
			}
		} catch (err: any) {
			logger.error("Webhook processing failed", { error: err.message });
		}
	};

	processWebhook().catch((err) => {
		logger.error("Webhook async handler failed", { error: err.message });
	});
});
