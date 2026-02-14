-- Initial schema migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_orgs_name ON orgs(name);

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

CREATE UNIQUE INDEX idx_templates_org_name_lang ON templates(org_id, name, language);
CREATE INDEX idx_templates_org_meta ON templates(org_id, meta_template_id);
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
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE campaign_recipients (
  recipient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  template_params JSONB,
  status TEXT NOT NULL,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);

CREATE TABLE campaign_runs (
  campaign_run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  org_id UUID NOT NULL REFERENCES orgs(id),
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id),
  scheduled_at TIMESTAMP NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE send_queue (
  queue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  campaign_run_id UUID NOT NULL REFERENCES campaign_runs(campaign_run_id),
  recipient_id UUID NOT NULL REFERENCES campaign_recipients(recipient_id),
  phone_number TEXT NOT NULL,
  template_params JSONB,
  status TEXT NOT NULL,
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
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id),
  limit_date DATE NOT NULL,
  sent_count INT NOT NULL DEFAULT 0,
  limit_count INT NOT NULL DEFAULT 1000
);

CREATE UNIQUE INDEX idx_daily_limits_org_account_date
  ON daily_limits (org_id, COALESCE(whatsapp_account_id, '00000000-0000-0000-0000-000000000000'::uuid), limit_date);

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
  assigned_at TIMESTAMP,
  status TEXT DEFAULT 'active',
  notes TEXT,
  resolved_at TIMESTAMP,
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  conversation_id UUID REFERENCES conversations(id),
  contact_id UUID REFERENCES contacts(id),
  direction TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  meta_message_id TEXT,
  status TEXT NOT NULL,
  retention_policy TEXT,
  template_params JSONB,
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMP,
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
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB,
  action_type TEXT NOT NULL,
  action_config JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_rules_org_active ON automation_rules(org_id, is_active);

CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  automation_rule_id UUID NOT NULL REFERENCES automation_rules(id),
  message_id UUID NOT NULL REFERENCES messages(id),
  action_taken TEXT NOT NULL,
  result TEXT NOT NULL,
  error_message TEXT,
  triggered_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_logs_org_rule ON automation_logs(org_id, automation_rule_id);

CREATE TABLE business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  timezone TEXT NOT NULL,
  day_of_week INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (org_id, day_of_week)
);

CREATE TABLE opt_in_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_timestamp ON audit_logs(org_id, timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
-- WhatsApp Business Account Integration
CREATE TABLE whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  phone_number_id TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  display_phone_number TEXT NOT NULL,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(org_id, phone_number_id)
);

CREATE INDEX idx_whatsapp_accounts_org ON whatsapp_accounts(org_id, is_active);

-- Webhook & Sync Health Tracking
CREATE TABLE webhook_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  last_webhook_timestamp TIMESTAMP,
  template_sync_status TEXT DEFAULT 'pending',
  last_template_sync TIMESTAMP,
  template_sync_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

CREATE INDEX idx_webhook_health_org ON webhook_health(org_id);
