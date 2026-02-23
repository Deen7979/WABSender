import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireBrandOwnershipFromParam } from "../middleware/brandContext.js";
import { db } from "../db/index.js";
import { config } from "../config/index.js";
import { encryptToken } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";
import { manualSyncTemplatesForBrand } from "../services/templateSync.js";

const upload = multer({ storage: multer.memoryStorage() });

const phoneRegex = /^\+?[1-9]\d{6,14}$/;

export const brandsRouter = Router();

const getMaxBrandsForOrg = async (orgId: string): Promise<number> => {
  const result = await db.query(
    `SELECT COALESCE(lp.max_brands, 1) AS max_brands
     FROM licenses l
     LEFT JOIN license_plans lp ON lp.id = l.plan_id
     WHERE l.issued_to_org_id = $1
       AND l.status = 'active'
       AND (l.expires_at IS NULL OR l.expires_at > now())
     ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
     LIMIT 1`,
    [orgId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return 1;
  }

  return Number(result.rows[0].max_brands ?? 1);
};

brandsRouter.get("/", requireAuth, async (req, res) => {
  const orgId = req.auth!.orgId;
  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? "10"), 10) || 10, 1), 100);
  const search = String(req.query.search ?? "").trim();
  const offset = (page - 1) * pageSize;

  const searchClause = search ? "AND (b.name ILIKE $2 OR b.company_name ILIKE $2 OR b.phone ILIKE $2)" : "";
  const searchParam = `%${search}%`;

  const listParams = search ? [orgId, searchParam, pageSize, offset] : [orgId, pageSize, offset];
  const countParams = search ? [orgId, searchParam] : [orgId];

  const listResult = await db.query(
    `SELECT b.id, b.name, b.company_name, b.phone, b.created_at
     FROM brands b
     WHERE b.org_id = $1 ${searchClause}
     ORDER BY b.created_at DESC
     LIMIT $${search ? 3 : 2} OFFSET $${search ? 4 : 3}`,
    listParams
  );

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM brands b
     WHERE b.org_id = $1 ${searchClause}`,
    countParams
  );

  return res.json({
    items: listResult.rows,
    total: countResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  });
});

brandsRouter.post("/create", requireAuth, upload.single("logo"), async (req, res) => {
  const orgId = req.auth!.orgId;

  const name = String(req.body.name ?? "").trim();
  const description = String(req.body.description ?? "").trim() || null;
  const companyName = String(req.body.companyName ?? "").trim();
  const phone = String(req.body.phone ?? "").trim();
  const timezone = String(req.body.timezone ?? "").trim();
  const notificationsEmail = String(req.body.notificationsEmail ?? "").trim() || null;
  const emailNotificationsEnabled = ["true", "1", "on", "yes"].includes(
    String(req.body.emailNotificationsEnabled ?? "false").toLowerCase()
  );

  const logoUrl = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
    : (String(req.body.logoUrl ?? "").trim() || null);

  if (!name || !companyName || !phone || !timezone) {
    return res.status(400).json({ error: "name, companyName, phone, timezone are required" });
  }

  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: "Invalid phone format" });
  }

  const maxBrands = await getMaxBrandsForOrg(orgId);
  const countResult = await db.query("SELECT COUNT(*)::int AS count FROM brands WHERE org_id = $1", [orgId]);
  const currentCount = Number(countResult.rows[0]?.count ?? 0);

  if (maxBrands !== -1 && currentCount >= maxBrands) {
    return res.status(403).json({
      code: "BRAND_LIMIT_REACHED",
      message: `Your current plan allows only ${maxBrands} brands. Please upgrade.`,
    });
  }

  const result = await db.query(
    `INSERT INTO brands (
      org_id, name, description, timezone, company_name, phone, logo_url,
      notifications_email, email_notifications_enabled
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, org_id, name, description, timezone, company_name, phone, logo_url, created_at`,
    [orgId, name, description, timezone, companyName, phone, logoUrl, notificationsEmail, emailNotificationsEnabled]
  );

  return res.status(201).json(result.rows[0]);
});

brandsRouter.get("/:brandId", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const brandId = req.params.brandId;
  const result = await db.query(
    `SELECT id, org_id, name, description, timezone, company_name, phone, logo_url,
            notifications_email, email_notifications_enabled, created_at
     FROM brands
     WHERE id = $1`,
    [brandId]
  );
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: "Brand not found" });
  }
  return res.json(result.rows[0]);
});

brandsRouter.put("/:brandId", requireAuth, requireBrandOwnershipFromParam, upload.single("logo"), async (req, res) => {
  const brandId = req.params.brandId;

  const name = String(req.body.name ?? "").trim();
  const description = String(req.body.description ?? "").trim() || null;
  const companyName = String(req.body.companyName ?? "").trim();
  const phone = String(req.body.phone ?? "").trim();
  const timezone = String(req.body.timezone ?? "").trim();
  const notificationsEmail = String(req.body.notificationsEmail ?? "").trim() || null;
  const emailNotificationsEnabled = ["true", "1", "on", "yes"].includes(
    String(req.body.emailNotificationsEnabled ?? "false").toLowerCase()
  );
  const logoUrl = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
    : (String(req.body.logoUrl ?? "").trim() || null);

  if (!name || !companyName || !phone || !timezone) {
    return res.status(400).json({ error: "name, companyName, phone, timezone are required" });
  }

  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: "Invalid phone format" });
  }

  const result = await db.query(
    `UPDATE brands
     SET name = $1,
         description = $2,
         timezone = $3,
         company_name = $4,
         phone = $5,
         logo_url = $6,
         notifications_email = $7,
         email_notifications_enabled = $8,
         updated_at = now()
     WHERE id = $9
     RETURNING id, org_id, name, description, timezone, company_name, phone, logo_url, created_at`,
    [name, description, timezone, companyName, phone, logoUrl, notificationsEmail, emailNotificationsEnabled, brandId]
  );

  return res.json(result.rows[0]);
});

brandsRouter.delete("/:brandId", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const brandId = req.params.brandId;

  await db.query("DELETE FROM template_sync_status WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM campaign_runs WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM send_queue WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM opt_in_events WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM messages WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE brand_id = $1)", [brandId]);
  await db.query("DELETE FROM conversations WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE brand_id = $1)", [brandId]);
  await db.query("DELETE FROM campaigns WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM templates WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM contacts WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM whatsapp_connections WHERE brand_id = $1", [brandId]);
  await db.query("DELETE FROM brands WHERE id = $1", [brandId]);

  return res.json({ success: true });
});

brandsRouter.get("/:brandId/whatsapp/status", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const brandId = req.params.brandId;
  const result = await db.query(
    `SELECT id, waba_id, phone_number_id, phone_number, token_expires_at, webhook_verified, last_webhook_time
     FROM whatsapp_connections
     WHERE brand_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [brandId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return res.json({ connected: false, status: "NOT_CONNECTED" });
  }

  const row = result.rows[0];
  return res.json({
    connected: true,
    status: "CONNECTED",
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    phoneNumber: row.phone_number,
    tokenExpiresAt: row.token_expires_at,
    webhookVerified: row.webhook_verified,
    lastWebhookTime: row.last_webhook_time,
  });
});

brandsRouter.get("/:brandId/whatsapp/init", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const orgId = req.auth!.orgId;
  const userId = req.auth!.userId;
  const brandId = req.params.brandId;

  const state = Buffer.from(JSON.stringify({ orgId, userId, brandId, timestamp: Date.now() })).toString("base64");
  const scopes = [
    "business_management",
    "whatsapp_business_management",
    "whatsapp_business_messaging",
  ];

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", config.metaAppId);
  authUrl.searchParams.set("redirect_uri", `${config.metaOAuthRedirectUri.replace(/\/$/, "")}/brands/whatsapp/callback`);
  authUrl.searchParams.set("scope", scopes.join(","));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  return res.json({ authUrl: authUrl.toString() });
});

brandsRouter.get("/whatsapp/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).json({ error: "Missing code or state parameter" });
  }

  try {
    const stateData = JSON.parse(Buffer.from(String(state), "base64").toString("utf8")) as {
      orgId: string;
      userId: string;
      brandId: string;
    };

    const tokenResponse = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.metaAppId,
        client_secret: config.metaAppSecret,
        redirect_uri: `${config.metaOAuthRedirectUri.replace(/\/$/, "")}/brands/whatsapp/callback`,
        code: String(code),
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`OAuth token exchange failed: ${errText}`);
    }

    const tokenJson = (await tokenResponse.json()) as { access_token: string };
    const shortLivedToken = tokenJson.access_token;

    const meResponse = await fetch(`https://graph.facebook.com/v19.0/me?fields=id&access_token=${shortLivedToken}`);
    const meData = (await meResponse.json()) as { id: string };
    const businessId = meData.id;

    const wabaResponse = await fetch(`https://graph.facebook.com/v19.0/${businessId}/owned_whatsapp_business_accounts?access_token=${shortLivedToken}`);
    const wabaData = (await wabaResponse.json()) as { data?: Array<{ id: string }> };
    const wabaId = wabaData.data?.[0]?.id;
    if (!wabaId) {
      throw new Error("No WhatsApp Business Account found");
    }

    const phoneResponse = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${shortLivedToken}`);
    const phoneData = (await phoneResponse.json()) as { data?: Array<{ id: string; display_phone_number?: string }> };
    const phone = phoneData.data?.[0];
    if (!phone?.id) {
      throw new Error("No phone number found for WABA");
    }

    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.metaAppId}&client_secret=${config.metaAppSecret}&fb_exchange_token=${shortLivedToken}`
    );
    const longLivedData = (await longLivedResponse.json()) as { access_token: string; expires_in?: number };
    const tokenExpiresAt = new Date(Date.now() + ((longLivedData.expires_in ?? 60 * 24 * 60 * 60) * 1000));

    const encryptedToken = encryptToken(longLivedData.access_token);

    await db.query(
      `INSERT INTO whatsapp_connections (
        brand_id, waba_id, phone_number_id, phone_number, access_token, token_expires_at, webhook_verified, last_webhook_time
      ) VALUES ($1,$2,$3,$4,$5,$6,false,null)
      ON CONFLICT (brand_id, phone_number_id)
      DO UPDATE SET
        waba_id = EXCLUDED.waba_id,
        phone_number = EXCLUDED.phone_number,
        access_token = EXCLUDED.access_token,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = now()`,
      [stateData.brandId, wabaId, phone.id, phone.display_phone_number ?? null, encryptedToken, tokenExpiresAt]
    );

    await manualSyncTemplatesForBrand(stateData.orgId, stateData.brandId);

    const redirectUrl = `${config.frontendUrl.replace(/\/$/, "")}/brands/${stateData.brandId}/whatsapp/setup`;
    return res.redirect(redirectUrl);
  } catch (error: any) {
    logger.error("Brand WhatsApp OAuth callback failed", { error: error?.message });
    return res.status(500).json({ error: error?.message || "OAuth callback failed" });
  }
});

brandsRouter.post("/:brandId/whatsapp/disconnect", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const brandId = req.params.brandId;
  await db.query("DELETE FROM whatsapp_connections WHERE brand_id = $1", [brandId]);
  return res.json({ success: true });
});

brandsRouter.get("/:brandId/whatsapp/webhook-health", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const brandId = req.params.brandId;
  const connectionResult = await db.query(
    `SELECT webhook_verified, last_webhook_time
     FROM whatsapp_connections
     WHERE brand_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [brandId]
  );
  const syncResult = await db.query(
    `SELECT sync_status, last_sync_time, approved_count, total_count, error
     FROM template_sync_status
     WHERE brand_id = $1`,
    [brandId]
  );

  return res.json({
    webhookVerified: connectionResult.rows[0]?.webhook_verified ?? false,
    lastWebhookTime: connectionResult.rows[0]?.last_webhook_time ?? null,
    syncStatus: syncResult.rows[0]?.sync_status ?? "pending",
    lastSyncTime: syncResult.rows[0]?.last_sync_time ?? null,
    approvedCount: Number(syncResult.rows[0]?.approved_count ?? 0),
    totalCount: Number(syncResult.rows[0]?.total_count ?? 0),
    error: syncResult.rows[0]?.error ?? null,
  });
});

brandsRouter.post("/:brandId/whatsapp/templates/sync", requireAuth, requireBrandOwnershipFromParam, async (req, res) => {
  const orgId = req.auth!.orgId;
  const brandId = req.params.brandId;
  const result = await manualSyncTemplatesForBrand(orgId, brandId);
  if (!result.success) {
    return res.status(400).json({ error: result.message, count: 0 });
  }
  return res.json(result);
});
