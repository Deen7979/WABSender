# WABSender Release v1.2.4

Date: 2026-02-22

## Highlights
- Subscription licensing is now wired end-to-end in platform admin flow.
- Super admin dashboard now uses the new subscription management panel instead of legacy perpetual-only UI.
- Backend now exposes subscription routes from the main API server.

## Changes
- Frontend
  - Integrated `SubscriptionLicenseManagement` into platform dashboard.
  - Removed legacy inline license issue/list block from platform dashboard.
  - Added subscription API client methods (plans, instances, details, issue, renew, revoke).
- Backend
  - Mounted `/subscription` router in API server.
  - Updated auth token typing/logic to allow super admin login with `orgId: null`.
- Desktop/Main
  - Fixed `node-machine-id` call signature in license service.

## Version Bumps
- `apps/desktop/package.json` → `1.2.4`
- `services/api/package.json` → `1.2.4`

## Database / Migration
- Ensure migrations are applied before deploying this release:
  - `cd services/api && npm run migrate`

## Build / Publish
- Build backend: `cd services/api && npm run build`
- Build desktop: `cd apps/desktop && npm run build`
- Publish desktop artifacts: `cd apps/desktop && npm run dist:publish`

## Notes
- This release includes subscription lifecycle support used by admin workflows (issue, activate, heartbeat, renew, revoke).
- Existing schemas remain additive via migration files.
