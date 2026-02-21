-- ====================================================================
-- PHASE 1: SUBSCRIPTION-BASED LICENSE SYSTEM MIGRATION
-- ====================================================================
-- This migration transforms the perpetual license system into a 
-- full-featured subscription-based license management system
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. LICENSE PLANS TABLE
-- Defines subscription tiers (Basic, Pro, Enterprise)
-- --------------------------------------------------------------------
CREATE TABLE license_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE, -- e.g., 'Basic', 'Pro', 'Enterprise'
  code TEXT NOT NULL UNIQUE, -- e.g., 'basic', 'pro', 'enterprise'
  duration_days INT NOT NULL DEFAULT 365, -- Yearly subscription by default
  max_devices INT NOT NULL DEFAULT 1,
  features JSONB NOT NULL DEFAULT '{}', -- Feature flags
  price_cents INT, -- Price in cents (optional, for future billing integration)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_plans_code ON license_plans(code);
CREATE INDEX idx_license_plans_active ON license_plans(is_active) WHERE is_active = true;

-- --------------------------------------------------------------------
-- 2. ENHANCE EXISTING LICENSE TABLE
-- Add subscription-specific fields
-- --------------------------------------------------------------------
ALTER TABLE licenses 
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES license_plans(id),
  ADD COLUMN IF NOT EXISTS seats_total INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seats_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

-- Index optimizations for subscription queries
CREATE INDEX idx_licenses_plan_id ON licenses(plan_id);
CREATE INDEX idx_licenses_org_status ON licenses(issued_to_org_id, status) WHERE issued_to_org_id IS NOT NULL;
CREATE INDEX idx_licenses_expires_at ON licenses(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_licenses_status ON licenses(status);

-- Update existing licenses to have expires_at if NULL (perpetual -> 1 year from now)
-- This is for migration compatibility
COMMENT ON COLUMN licenses.expires_at IS 'NULL = perpetual (legacy), otherwise subscription expiry date';

-- --------------------------------------------------------------------
-- 3. ENHANCE LICENSE ACTIVATIONS TABLE
-- Add heartbeat tracking and additional metadata
-- --------------------------------------------------------------------
ALTER TABLE license_activations
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS machine_info JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reassigned_from TEXT;

-- Indexes for heartbeat monitoring
CREATE INDEX idx_license_activations_heartbeat ON license_activations(last_heartbeat DESC) WHERE deactivated_at IS NULL;
CREATE INDEX idx_license_activations_device ON license_activations(device_id, deactivated_at);

-- --------------------------------------------------------------------
-- 4. AUDIT LOG TABLE
-- Track all license lifecycle events
-- --------------------------------------------------------------------
CREATE TABLE license_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
  activation_id UUID REFERENCES license_activations(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Who performed the action
  actor_role TEXT, -- e.g., 'super_admin', 'admin'
  action TEXT NOT NULL, -- issued, activated, renewed, revoked, heartbeat, deactivated
  target_type TEXT NOT NULL, -- license, activation, plan
  target_id UUID,
  org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_audit_logs_license ON license_audit_logs(license_id, timestamp DESC);
CREATE INDEX idx_license_audit_logs_activation ON license_audit_logs(activation_id, timestamp DESC);
CREATE INDEX idx_license_audit_logs_org ON license_audit_logs(org_id, timestamp DESC);
CREATE INDEX idx_license_audit_logs_action ON license_audit_logs(action, timestamp DESC);
CREATE INDEX idx_license_audit_logs_timestamp ON license_audit_logs(timestamp DESC);

-- --------------------------------------------------------------------
-- 5. REFRESH TOKEN TABLE
-- For JWT token management and blacklisting
-- --------------------------------------------------------------------
CREATE TABLE license_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activation_id UUID NOT NULL REFERENCES license_activations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA256 of refresh token
  device_id TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_activation ON license_refresh_tokens(activation_id);
CREATE INDEX idx_refresh_tokens_hash ON license_refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_device ON license_refresh_tokens(device_id, org_id);
CREATE INDEX idx_refresh_tokens_expires ON license_refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- --------------------------------------------------------------------
-- 6. LICENSE METRICS TABLE
-- Track usage statistics for analytics
-- --------------------------------------------------------------------
CREATE TABLE license_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  active_devices INT NOT NULL DEFAULT 0,
  total_heartbeats INT NOT NULL DEFAULT 0,
  failed_validations INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(license_id, metric_date)
);

CREATE INDEX idx_license_metrics_license_date ON license_metrics(license_id, metric_date DESC);
CREATE INDEX idx_license_metrics_date ON license_metrics(metric_date DESC);

-- --------------------------------------------------------------------
-- 7. DEVICE FINGERPRINTS TABLE (Security Enhancement)
-- Prevent license key sharing
-- --------------------------------------------------------------------
CREATE TABLE device_fingerprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT NOT NULL UNIQUE,
  fingerprint_hash TEXT NOT NULL, -- Hash of hardware characteristics
  org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activation_count INT NOT NULL DEFAULT 0,
  flagged_suspicious BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_device_fingerprints_device ON device_fingerprints(device_id);
CREATE INDEX idx_device_fingerprints_org ON device_fingerprints(org_id);
CREATE INDEX idx_device_fingerprints_suspicious ON device_fingerprints(flagged_suspicious) WHERE flagged_suspicious = true;

-- --------------------------------------------------------------------
-- 8. INSERT DEFAULT LICENSE PLANS
-- --------------------------------------------------------------------
INSERT INTO license_plans (name, code, duration_days, max_devices, features, price_cents) VALUES
  ('Basic', 'basic', 365, 1, '{"contacts": 1000, "campaigns": 10, "templates": 20, "support": "email"}', 9900),
  ('Professional', 'pro', 365, 3, '{"contacts": 10000, "campaigns": 100, "templates": 100, "support": "priority", "automation": true}', 29900),
  ('Enterprise', 'enterprise', 365, 10, '{"contacts": -1, "campaigns": -1, "templates": -1, "support": "24/7", "automation": true, "api_access": true, "white_label": true}', 99900)
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------
-- 9. MIGRATE EXISTING LICENSES TO SUBSCRIPTION MODEL
-- --------------------------------------------------------------------
-- Link existing licenses to appropriate plans based on plan_code
UPDATE licenses l
SET plan_id = (SELECT id FROM license_plans WHERE code = l.plan_code LIMIT 1)
WHERE plan_id IS NULL AND plan_code IS NOT NULL;

-- Set default plan for licenses without a plan_code
UPDATE licenses l
SET plan_id = (SELECT id FROM license_plans WHERE code = 'basic' LIMIT 1)
WHERE plan_id IS NULL;

-- Update seats_total to match max_devices
UPDATE licenses
SET seats_total = max_devices
WHERE seats_total = 1;

-- Update seats_used based on active activations
UPDATE licenses l
SET seats_used = (
  SELECT COUNT(*)::int 
  FROM license_activations la 
  WHERE la.license_id = l.id AND la.deactivated_at IS NULL
);

-- Set issued_at for existing licenses
UPDATE licenses
SET issued_at = created_at
WHERE issued_at IS NULL;

-- --------------------------------------------------------------------
-- 10. FUNCTIONS AND TRIGGERS
-- --------------------------------------------------------------------

-- Function: Update seats_used when activation changes
CREATE OR REPLACE FUNCTION update_license_seats_used()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.deactivated_at IS NULL AND OLD.deactivated_at IS NOT NULL) THEN
    UPDATE licenses 
    SET seats_used = seats_used + 1,
        updated_at = now()
    WHERE id = NEW.license_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deactivated_at IS NOT NULL AND OLD.deactivated_at IS NULL THEN
    UPDATE licenses 
    SET seats_used = GREATEST(0, seats_used - 1),
        updated_at = now()
    WHERE id = NEW.license_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE licenses 
    SET seats_used = GREATEST(0, seats_used - 1),
        updated_at = now()
    WHERE id = OLD.license_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_license_activations_update_seats
AFTER INSERT OR UPDATE OR DELETE ON license_activations
FOR EACH ROW
EXECUTE FUNCTION update_license_seats_used();

-- Function: Auto-expire licenses
CREATE OR REPLACE FUNCTION check_license_expiry()
RETURNS void AS $$
BEGIN
  UPDATE licenses
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active' 
    AND expires_at IS NOT NULL 
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Function: Update license updated_at timestamp
CREATE OR REPLACE FUNCTION update_license_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_licenses_updated_at
BEFORE UPDATE ON licenses
FOR EACH ROW
EXECUTE FUNCTION update_license_timestamp();

CREATE TRIGGER trg_license_plans_updated_at
BEFORE UPDATE ON license_plans
FOR EACH ROW
EXECUTE FUNCTION update_license_timestamp();

-- --------------------------------------------------------------------
-- 11. VIEWS FOR REPORTING
-- --------------------------------------------------------------------

-- View: Active subscription licenses with full details
CREATE OR REPLACE VIEW v_active_subscriptions AS
SELECT 
  l.id AS license_id,
  l.issued_to_org_id AS org_id,
  o.name AS org_name,
  lp.name AS plan_name,
  lp.code AS plan_code,
  l.status,
  l.seats_total,
  l.seats_used,
  l.seats_total - l.seats_used AS seats_available,
  l.expires_at,
  CASE 
    WHEN l.expires_at IS NULL THEN NULL
    WHEN l.expires_at < now() THEN 'expired'
    WHEN l.expires_at < now() + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS expiry_status,
  l.issued_at,
  l.renewed_at,
  (SELECT COUNT(*)::int FROM license_activations la WHERE la.license_id = l.id AND la.deactivated_at IS NULL) AS active_devices,
  (SELECT MAX(la.last_heartbeat) FROM license_activations la WHERE la.license_id = l.id AND la.deactivated_at IS NULL) AS last_heartbeat
FROM licenses l
LEFT JOIN orgs o ON o.id = l.issued_to_org_id
LEFT JOIN license_plans lp ON lp.id = l.plan_id
WHERE l.status IN ('active', 'expired');

-- View: License usage analytics
CREATE OR REPLACE VIEW v_license_analytics AS
SELECT 
  DATE_TRUNC('day', timestamp) AS date,
  action,
  COUNT(*) AS event_count,
  COUNT(DISTINCT license_id) AS unique_licenses,
  COUNT(DISTINCT org_id) AS unique_orgs
FROM license_audit_logs
WHERE timestamp >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', timestamp), action
ORDER BY date DESC, action;

-- --------------------------------------------------------------------
-- 12. SECURITY: ROW LEVEL SECURITY (Optional, commented out)
-- Uncomment if you want to enable RLS for additional security
-- --------------------------------------------------------------------

-- ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE license_activations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE license_audit_logs ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY license_org_isolation ON licenses
--   USING (issued_to_org_id = current_setting('app.current_org_id')::UUID OR current_setting('app.user_role') = 'super_admin');

-- CREATE POLICY activation_org_isolation ON license_activations
--   USING (org_id = current_setting('app.current_org_id')::UUID OR current_setting('app.user_role') = 'super_admin');

-- --------------------------------------------------------------------
-- MIGRATION COMPLETE
-- --------------------------------------------------------------------

COMMENT ON TABLE license_plans IS 'Subscription plan definitions (Basic, Pro, Enterprise)';
COMMENT ON TABLE licenses IS 'License instances assigned to organizations - now subscription-based';
COMMENT ON TABLE license_activations IS 'Device activations with heartbeat tracking';
COMMENT ON TABLE license_audit_logs IS 'Complete audit trail for all license operations';
COMMENT ON TABLE license_refresh_tokens IS 'JWT refresh token management and revocation';
COMMENT ON TABLE license_metrics IS 'Daily aggregated license usage metrics';
COMMENT ON TABLE device_fingerprints IS 'Device identification for security and fraud detection';

