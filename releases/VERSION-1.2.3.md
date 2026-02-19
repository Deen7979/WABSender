# WABSender Release v1.2.3

Date: 2026-02-19

Highlights:
- Core: Multi-brand groundwork and stability patches (preparatory, not enabled in GA).
- Backend: Minor fixes and migration readiness for brand_id column additions.
- Desktop: Bugfixes for WebSocket reconnect and license activation flow.

Changes:
- Bumped package versions to `1.2.3` for desktop and backend packages.
- Added migration scaffolding and release plan docs for Enterprise V2.

Upgrade notes:
- Run database migrations before deploying workers: `cd services/api && npm run migrate`.
- Build backend and desktop artifacts before release:
  - `cd services/api && npm run build`
  - `cd apps/desktop && npm run build`
- Deployment: Use existing deployment pipelines; this release contains schema-additive changes.

Backwards compatibility:
- Data migrations are additive; existing org-only behavior preserved via default brand mapping.

Files changed:
- `apps/desktop/package.json` -> version 1.2.3
- `services/api/package.json` -> version 1.2.3
- `releases/VERSION-1.2.3.md` -> this file

For full Enterprise V2 roadmap, see `docs/newversion/12_ENTERPRISE_V2_IMPLEMENTATION_PLAN.md`.
