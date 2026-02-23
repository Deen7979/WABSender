import bcrypt from "bcryptjs";
import { db } from "../index.js";
import { encryptToken } from "../../utils/encryption.js";

const required = [
  "SEED_ORG_NAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD"
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key}`);
  }
}

const run = async () => {
  const orgName = process.env.SEED_ORG_NAME as string;
  const email = process.env.SEED_ADMIN_EMAIL as string;
  const password = process.env.SEED_ADMIN_PASSWORD as string;
  const wabaId = process.env.SEED_WABA_ID || null;
  const phoneNumberId = process.env.SEED_PHONE_NUMBER_ID || null;
  const displayPhone = process.env.SEED_DISPLAY_PHONE_NUMBER || null;
  const seedAccessToken = process.env.SEED_WHATSAPP_ACCESS_TOKEN || null;

  const orgResult = await db.query(
    "INSERT INTO orgs (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [orgName]
  );
  const orgId = orgResult.rows[0].id;

  const passwordHash = await bcrypt.hash(password, 10);
  const userResult = await db.query(
    "INSERT INTO users (org_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id",
    [orgId, email, passwordHash]
  );
  const userId = userResult.rows[0].id;

  const brandResult = await db.query(
    `INSERT INTO brands (org_id, name, description, timezone, company_name, phone)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, lower(name)) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [orgId, `${orgName} Brand`, 'Seeded brand', 'UTC', orgName, '+10000000000']
  );
  const brandId = brandResult.rows[0].id;

  if (wabaId && phoneNumberId && seedAccessToken) {
    await db.query(
      `INSERT INTO whatsapp_connections (brand_id, waba_id, phone_number_id, phone_number, access_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '60 days')
       ON CONFLICT (brand_id, phone_number_id)
       DO UPDATE SET
         waba_id = EXCLUDED.waba_id,
         phone_number = EXCLUDED.phone_number,
         access_token = EXCLUDED.access_token,
         token_expires_at = EXCLUDED.token_expires_at,
         updated_at = now()`,
      [brandId, wabaId, phoneNumberId, displayPhone, encryptToken(seedAccessToken)]
    );
  }

  return { orgId, userId, brandId };
};

run()
  .then((result) => {
    console.log("Seed complete", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  });
