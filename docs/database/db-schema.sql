-- WhatsApp Cloud Desktop App (Finalized Schema Draft)
-- Notes:
-- 1) Multi-tenant (org_id on all tenant-scoped tables)
-- 2) Retention-ready: retention_policy + deleted_at on messages
-- 3) Per-agent unread counts via conversation_reads + conversation_participants

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  phone_e164 TEXT NOT NULL,
  name TEXT,
  custom_fields JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_e164)
);

CREATE INDEX idx_contacts_org_phone ON contacts(org_id, phone_e164);

CREATE TABLE contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (contact_id, tag)
);

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  meta_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  components JSONB NOT NULL,
  status TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_templates_org_meta ON templates(org_id, meta_template_id);
CREATE INDEX idx_templates_org_name ON templates(org_id, name);

CREATE TABLE whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  phone_number_id TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  display_phone_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_number_id)
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  template_id UUID REFERENCES templates(id),
  scheduled_at TIMESTAMP,
  status TEXT NOT NULL, -- draft/scheduled/paused/completed
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  template_params JSONB,
  status TEXT NOT NULL, -- pending/sent/delivered/read/failed
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);

CREATE TABLE campaign_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  org_id UUID NOT NULL REFERENCES orgs(id),
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id),
  scheduled_at TIMESTAMP NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status TEXT NOT NULL, -- scheduled/running/paused/completed/failed
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE send_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  campaign_run_id UUID NOT NULL REFERENCES campaign_runs(id),
  recipient_id UUID NOT NULL REFERENCES campaign_recipients(id),
  phone_number TEXT NOT NULL,
  template_params JSONB,
  status TEXT NOT NULL, -- pending/retrying/sent/failed
  attempts INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  processed_at TIMESTAMP,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE daily_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id), -- NULL for org-level limits
  limit_date DATE NOT NULL,
  sent_count INT NOT NULL DEFAULT 0,
  limit_count INT NOT NULL DEFAULT 1000,
  UNIQUE (org_id, COALESCE(whatsapp_account_id, '00000000-0000-0000-0000-000000000000'::uuid), limit_date)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  last_message_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_conversations_org_contact ON conversations(org_id, contact_id);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unread_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMP,
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  conversation_id UUID REFERENCES conversations(id),
  contact_id UUID REFERENCES contacts(id),
  direction TEXT NOT NULL, -- inbound/outbound
  body TEXT,
  media_url TEXT,
  meta_message_id TEXT,
  status TEXT NOT NULL, -- queued/sent/delivered/read/failed
  retention_policy TEXT,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_meta_id ON messages(meta_message_id);

CREATE TABLE message_status_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  rule_type TEXT NOT NULL, -- keyword / business_hours
  config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE opt_in_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  event_type TEXT NOT NULL, -- opt_in / opt_out
  source TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);
