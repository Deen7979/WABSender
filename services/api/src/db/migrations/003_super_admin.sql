-- Super admin support (org_id nullable, role constraint)
ALTER TABLE users
  ALTER COLUMN org_id DROP NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_role_org_check
  CHECK (
    (role = 'super_admin' AND org_id IS NULL)
    OR (role <> 'super_admin' AND org_id IS NOT NULL)
  );
