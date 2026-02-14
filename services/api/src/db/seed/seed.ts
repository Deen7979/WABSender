import bcrypt from "bcryptjs";
import { db } from "../index.js";

const required = [
  "SEED_ORG_NAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "SEED_WABA_ID",
  "SEED_PHONE_NUMBER_ID"
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
  const wabaId = process.env.SEED_WABA_ID as string;
  const phoneNumberId = process.env.SEED_PHONE_NUMBER_ID as string;
  const displayPhone = process.env.SEED_DISPLAY_PHONE_NUMBER || null;

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

  await db.query(
    "INSERT INTO whatsapp_accounts (org_id, phone_number_id, waba_id, display_phone_number, is_active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (org_id, phone_number_id) DO UPDATE SET waba_id = EXCLUDED.waba_id, display_phone_number = EXCLUDED.display_phone_number, is_active = true",
    [orgId, phoneNumberId, wabaId, displayPhone]
  );

  return { orgId, userId };
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
