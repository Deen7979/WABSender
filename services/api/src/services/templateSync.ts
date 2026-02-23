import { db } from "../db/index.js";
import { config } from "../config/index.js";
import { decryptToken } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";

type SyncStatus = "pending" | "syncing" | "success" | "error";

interface MetaTemplate {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: unknown[];
  id?: string;
}

const allowedStatuses = new Set(["APPROVED", "ACTIVE", "QUALITY_PENDING"]);

const updateSyncStatus = async (
  brandId: string,
  status: SyncStatus,
  approvedCount = 0,
  totalCount = 0,
  error: string | null = null
) => {
  await db.query(
    `INSERT INTO template_sync_status (brand_id, sync_status, last_sync_time, approved_count, total_count, error, updated_at)
     VALUES ($1, $2, CASE WHEN $2 = 'success' THEN now() ELSE NULL END, $3, $4, $5, now())
     ON CONFLICT (brand_id)
     DO UPDATE SET
       sync_status = EXCLUDED.sync_status,
       last_sync_time = CASE WHEN EXCLUDED.sync_status = 'success' THEN now() ELSE template_sync_status.last_sync_time END,
       approved_count = EXCLUDED.approved_count,
       total_count = EXCLUDED.total_count,
       error = EXCLUDED.error,
       updated_at = now()`,
    [brandId, status, approvedCount, totalCount, error]
  );
};

export const syncTemplatesForBrand = async (orgId: string, brandId: string, wabaId: string): Promise<number> => {
  await updateSyncStatus(brandId, "syncing", 0, 0, null);

  const connectionResult = await db.query(
    `SELECT access_token
     FROM whatsapp_connections
     WHERE brand_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [brandId]
  );

  if ((connectionResult.rowCount ?? 0) === 0) {
    await updateSyncStatus(brandId, "error", 0, 0, "No active WhatsApp connection found");
    throw new Error("No active WhatsApp connection found");
  }

  const accessToken = decryptToken(connectionResult.rows[0].access_token);
  const templates: MetaTemplate[] = [];

  let nextUrl: string | null = `https://graph.facebook.com/${config.graphApiVersion}/${wabaId}/message_templates?access_token=${encodeURIComponent(accessToken)}&fields=name,status,category,language,components,id&limit=200`;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      const text = await response.text();
      await updateSyncStatus(brandId, "error", 0, 0, text.slice(0, 500));
      throw new Error(`Meta API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { data?: MetaTemplate[]; paging?: { next?: string } };
    templates.push(...(data.data || []));
    nextUrl = data.paging?.next || null;
  }

  let approvedCount = 0;

  for (const template of templates) {
    const normalizedStatus = (template.status || "").toUpperCase();
    if (!allowedStatuses.has(normalizedStatus)) {
      continue;
    }

    const name = template.name?.trim();
    if (!name) {
      continue;
    }

    approvedCount += 1;

    await db.query(
      `INSERT INTO templates (org_id, brand_id, meta_template_id, name, language, category, components, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (org_id, brand_id, name, language)
       DO UPDATE SET
         meta_template_id = EXCLUDED.meta_template_id,
         category = EXCLUDED.category,
         components = EXCLUDED.components,
         status = EXCLUDED.status,
         updated_at = now()`,
      [
        orgId,
        brandId,
        template.id || `${name}:${template.language || "und"}`,
        name,
        template.language || "und",
        template.category || "UNKNOWN",
        JSON.stringify(template.components || []),
        template.status || "UNKNOWN",
      ]
    );
  }

  await updateSyncStatus(brandId, "success", approvedCount, templates.length, null);
  logger.info("Brand template sync complete", { brandId, approvedCount, totalCount: templates.length });
  return approvedCount;
};

export const manualSyncTemplatesForBrand = async (
  orgId: string,
  brandId: string
): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const accountResult = await db.query(
      `SELECT waba_id
       FROM whatsapp_connections
       WHERE brand_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [brandId]
    );

    if ((accountResult.rowCount ?? 0) === 0) {
      return { success: false, count: 0, message: "No active WhatsApp connection connected" };
    }

    const count = await syncTemplatesForBrand(orgId, brandId, accountResult.rows[0].waba_id);
    return { success: true, count, message: `Synced ${count} templates` };
  } catch (error: any) {
    logger.error("Manual brand template sync failed", { brandId, error: error?.message });
    return { success: false, count: 0, message: `Sync failed: ${error?.message || "unknown error"}` };
  }
};

export const getApprovedTemplates = async (orgId: string, brandId: string) => {
  const result = await db.query(
    `SELECT id, name, language, category, components
     FROM templates
     WHERE org_id = $1
       AND brand_id = $2
       AND status IN ('APPROVED', 'ACTIVE', 'QUALITY_PENDING')
     ORDER BY name ASC`,
    [orgId, brandId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    language: row.language,
    category: row.category,
    components: Array.isArray(row.components) ? row.components : JSON.parse(row.components || "[]"),
  }));
};

export const manualSyncTemplates = async (orgId: string) => {
  const brandResult = await db.query(
    `SELECT id
     FROM brands
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [orgId]
  );

  if ((brandResult.rowCount ?? 0) === 0) {
    return { success: false, count: 0, message: "No brands found" };
  }

  return manualSyncTemplatesForBrand(orgId, brandResult.rows[0].id);
};

export const syncTemplatesForOrg = async (orgId: string, _wabaId: string): Promise<number> => {
  const brandResult = await db.query(
    `SELECT id
     FROM brands
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [orgId]
  );

  if ((brandResult.rowCount ?? 0) === 0) {
    return 0;
  }

  const result = await manualSyncTemplatesForBrand(orgId, brandResult.rows[0].id);
  if (!result.success) {
    throw new Error(result.message);
  }
  return result.count;
};
