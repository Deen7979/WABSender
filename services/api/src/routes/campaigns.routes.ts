import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { auditLog, AuditAction, ResourceType } from "../middleware/auditLog.js";

export const campaignsRouter = Router();

campaignsRouter.get("/", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const result = await db.query(
    "SELECT id, name, template_id, scheduled_at, status, created_at FROM campaigns WHERE org_id = $1 ORDER BY created_at DESC",
    [orgId]
  );
  return res.json(result.rows);
});

campaignsRouter.post("/", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const { name, templateId, recipients } = req.body as {
    name?: string;
    templateId?: string;
    recipients?: Array<{ contactId: string; templateParams?: any }>;
  };

  if (!name || !templateId || !recipients?.length) {
    return res.status(400).json({ error: "name, templateId, recipients required" });
  }

  const campaignResult = await db.query(
    "INSERT INTO campaigns (org_id, name, template_id, status) VALUES ($1, $2, $3, 'draft') RETURNING id",
    [orgId, name, templateId]
  );
  const campaignId = campaignResult.rows[0].id;

  // Deduplicate recipients by contactId
  const uniqueRecipients = Array.from(
    new Map(recipients.map((r) => [r.contactId, r])).values()
  );

  for (const recipient of uniqueRecipients) {
    const contact = await db.query(
      "SELECT phone_e164 FROM contacts WHERE id = $1 AND org_id = $2",
      [recipient.contactId, orgId]
    );
    if (contact.rowCount === 0) {
      continue; // Skip invalid contact
    }
    const phoneNumber = contact.rows[0].phone_e164;
    await db.query(
      "INSERT INTO campaign_recipients (campaign_id, contact_id, phone_number, template_params, status) VALUES ($1, $2, $3, $4, 'pending')",
      [campaignId, recipient.contactId, phoneNumber, JSON.stringify(recipient.templateParams || {})]
    );
  }

  await auditLog(req, AuditAction.CAMPAIGN_CREATED, ResourceType.CAMPAIGN, campaignId, {
    name,
    templateId,
    recipientCount: uniqueRecipients.length,
  });

  return res.json({ id: campaignId });
});

campaignsRouter.post("/:id/schedule", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const campaignId = req.params.id;
  const { scheduledAt, idempotencyKey, whatsappAccountId } = req.body as {
    scheduledAt?: string;
    idempotencyKey?: string;
    whatsappAccountId?: string;
  };

  if (!scheduledAt || !idempotencyKey || !whatsappAccountId) {
    return res.status(400).json({ error: "scheduledAt, idempotencyKey, and whatsappAccountId required" });
  }

  const campaign = await db.query(
    "SELECT id FROM campaigns WHERE id = $1 AND org_id = $2",
    [campaignId, orgId]
  );
  if (campaign.rowCount === 0) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const insertRun = await db.query(
    "INSERT INTO campaign_runs (campaign_id, org_id, whatsapp_account_id, scheduled_at, status, idempotency_key) VALUES ($1, $2, $3, $4, 'scheduled', $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id",
    [campaignId, orgId, whatsappAccountId, scheduledAt, idempotencyKey]
  );

  const runId = insertRun.rowCount
    ? insertRun.rows[0].id
    : (await db.query("SELECT id FROM campaign_runs WHERE idempotency_key = $1", [idempotencyKey])).rows[0]?.id;

  await db.query(
    "UPDATE campaigns SET status = 'scheduled', scheduled_at = $1 WHERE id = $2",
    [scheduledAt, campaignId]
  );

  await auditLog(req, AuditAction.CAMPAIGN_SCHEDULED, ResourceType.CAMPAIGN, campaignId, {
    scheduledAt,
    whatsappAccountId,
    runId,
  });

  return res.json({ runId });
});

campaignsRouter.post("/:id/pause", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const campaignId = req.params.id;

  const result = await db.query(
    "UPDATE campaigns SET status = 'paused' WHERE id = $1 AND org_id = $2 RETURNING id",
    [campaignId, orgId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  await auditLog(req, AuditAction.CAMPAIGN_PAUSED, ResourceType.CAMPAIGN, campaignId, {
    status: "paused",
  });

  return res.json({ id: campaignId, status: "paused" });
});

campaignsRouter.post("/:id/resume", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const campaignId = req.params.id;

  const result = await db.query(
    "UPDATE campaigns SET status = 'scheduled' WHERE id = $1 AND org_id = $2 RETURNING id",
    [campaignId, orgId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  return res.json({ id: campaignId, status: "scheduled" });
});

campaignsRouter.get("/:id/stats", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const campaignId = req.params.id;

  const campaign = await db.query(
    "SELECT id FROM campaigns WHERE id = $1 AND org_id = $2",
    [campaignId, orgId]
  );
  if (campaign.rowCount === 0) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const result = await db.query(
    "SELECT status, COUNT(*)::int AS count FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status",
    [campaignId]
  );

  const stats: Record<string, number> = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  for (const row of result.rows) {
    stats[row.status] = row.count;
  }

  return res.json(stats);
});
