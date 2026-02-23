CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  timezone TEXT NOT NULL,
  company_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  logo_url TEXT,
  notifications_email TEXT,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_org_created ON brands(org_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_org_name ON brands(org_id, lower(name));

ALTER TABLE license_plans
  ADD COLUMN IF NOT EXISTS max_brands INT NOT NULL DEFAULT 1;

UPDATE license_plans
SET max_brands = CASE
  WHEN code = 'enterprise' THEN -1
  WHEN code = 'pro' THEN 5
  WHEN code = 'basic' THEN 1
  ELSE max_brands
END
WHERE max_brands = 1;

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  phone_number TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  last_webhook_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, phone_number_id),
  UNIQUE(phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_brand ON whatsapp_connections(brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS template_sync_status (
  brand_id UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_sync_time TIMESTAMPTZ,
  approved_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE campaign_runs ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE send_queue ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE daily_limits ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE opt_in_events ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contacts_org_brand_phone ON contacts(org_id, brand_id, phone_e164);
CREATE INDEX IF NOT EXISTS idx_templates_org_brand_name ON templates(org_id, brand_id, name);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_brand_created ON campaigns(org_id, brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_org_brand_last ON conversations(org_id, brand_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_org_brand_created ON messages(org_id, brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opt_in_org_brand_contact ON opt_in_events(org_id, brand_id, contact_id);

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_org_id_phone_e164_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_brand_phone_unique ON contacts(org_id, brand_id, phone_e164);

ALTER TABLE templates DROP CONSTRAINT IF EXISTS idx_templates_org_name_lang;
DROP INDEX IF EXISTS idx_templates_org_name_lang;
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_org_brand_name_lang_unique ON templates(org_id, brand_id, name, language);

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS idx_conversations_org_contact;
DROP INDEX IF EXISTS idx_conversations_org_contact;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_org_brand_contact_unique ON conversations(org_id, brand_id, contact_id);