import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireBrandContext } from "../middleware/brandContext.js";
import { db } from "../db/index.js";
import { auditMiddleware, AuditAction, ResourceType } from "../middleware/auditLog.js";

export const optInRouter = Router();

optInRouter.post("/", requireAuth, requireBrandContext, auditMiddleware(AuditAction.OPT_IN_RECORDED, ResourceType.OPT_IN), async (req, res) => {
  const orgId = req.auth!.orgId;
  const brandId = req.brandId!;
  const { contactId, eventType, source } = req.body as {
    contactId?: string;
    eventType?: "opt_in" | "opt_out";
    source?: string;
  };

  if (!contactId || !eventType || !source) {
    return res.status(400).json({ error: "contactId, eventType, source required" });
  }

  const contact = await db.query(
    "SELECT id FROM contacts WHERE id = $1 AND org_id = $2 AND brand_id = $3",
    [contactId, orgId, brandId]
  );
  if (contact.rowCount === 0) {
    return res.status(404).json({ error: "Contact not found" });
  }

  const result = await db.query(
    "INSERT INTO opt_in_events (org_id, brand_id, contact_id, event_type, source) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [orgId, brandId, contactId, eventType, source]
  );

  return res.json({ id: result.rows[0].id });
});
