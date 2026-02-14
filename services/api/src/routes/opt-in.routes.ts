import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";

export const optInRouter = Router();

optInRouter.post("/", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const { contactId, eventType, source } = req.body as {
    contactId?: string;
    eventType?: "opt_in" | "opt_out";
    source?: string;
  };

  if (!contactId || !eventType || !source) {
    return res.status(400).json({ error: "contactId, eventType, source required" });
  }

  const contact = await db.query(
    "SELECT id FROM contacts WHERE id = $1 AND org_id = $2",
    [contactId, orgId]
  );
  if (contact.rowCount === 0) {
    return res.status(404).json({ error: "Contact not found" });
  }

  const result = await db.query(
    "INSERT INTO opt_in_events (org_id, contact_id, event_type, source) VALUES ($1, $2, $3, $4) RETURNING id",
    [orgId, contactId, eventType, source]
  );

  return res.json({ id: result.rows[0].id });
});
