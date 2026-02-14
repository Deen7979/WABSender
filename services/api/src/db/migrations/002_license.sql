-- License and activation tables
CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan_code TEXT NOT NULL DEFAULT 'perpetual',
  max_devices INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  issued_to_org_id UUID REFERENCES orgs(id),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (license_key_hash)
);

CREATE TABLE license_activations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id UUID NOT NULL REFERENCES licenses(id),
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID REFERENCES users(id),
  device_id TEXT NOT NULL,
  device_label TEXT,
  activated_at TIMESTAMP NOT NULL DEFAULT now(),
  last_validated_at TIMESTAMP NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMP,
  UNIQUE (license_id, device_id)
);

CREATE INDEX idx_license_activations_org ON license_activations(org_id);
CREATE INDEX idx_license_activations_license ON license_activations(license_id);
CREATE UNIQUE INDEX idx_license_activations_active_device
  ON license_activations(org_id, device_id)
  WHERE deactivated_at IS NULL;
