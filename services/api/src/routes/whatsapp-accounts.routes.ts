import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";

export const whatsappAccountsRouter = Router();

whatsappAccountsRouter.get("/", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const result = await db.query(
    "SELECT id, phone_number_id, waba_id, display_phone_number, is_active, created_at FROM whatsapp_accounts WHERE org_id = $1 ORDER BY created_at DESC",
    [orgId]
  );
  return res.json(result.rows);
});

whatsappAccountsRouter.post("/", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const { phoneNumberId, wabaId, displayPhoneNumber, isActive } = req.body as {
    phoneNumberId?: string;
    wabaId?: string;
    displayPhoneNumber?: string;
    isActive?: boolean;
  };

  if (!phoneNumberId || !wabaId) {
    return res.status(400).json({ error: "phoneNumberId and wabaId required" });
  }

  const result = await db.query(
    "INSERT INTO whatsapp_accounts (org_id, phone_number_id, waba_id, display_phone_number, is_active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (org_id, phone_number_id) DO UPDATE SET waba_id = EXCLUDED.waba_id, display_phone_number = EXCLUDED.display_phone_number, is_active = EXCLUDED.is_active RETURNING id, phone_number_id, waba_id, display_phone_number, is_active",
    [orgId, phoneNumberId, wabaId, displayPhoneNumber || null, isActive ?? true]
  );

  return res.json(result.rows[0]);
});
