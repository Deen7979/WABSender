# Implementation Backlog (Milestones + Estimates)

Estimates are in working days and assume one small full‑stack team.

## Phase 1 — Core Messaging + Contacts (Approx. 23 days)
1. Repo setup + linting + CI (3)
2. Auth + multi‑tenant scaffolding (4)
3. Contacts import + tagging (6)
4. Templates sync + preview (5)
5. Single send pipeline + webhook status (5)

**Acceptance:** Send a template message to a list and receive status updates.

## Phase 2 — Campaigns + Scheduler (Approx. 19 days)
1. Campaign creation UI + API (6)
2. Scheduler + rate limiter (7)
3. Pause/resume flows (3)
4. Campaign stats (3)

**Acceptance:** Scheduled campaign executes with daily limits.

## Phase 3 — Inbox + Automation (Approx. 26 days)
1. Conversations + message history (8)
2. WebSocket realtime updates (6)
3. Manual reply + quick replies (6)
4. Automation rules + business hours (6)

**Acceptance:** Inbound message appears in inbox within 2 seconds and can be replied to.

## Phase 4 — Reports + Packaging (Approx. 16 days)
1. Reporting UI + CSV export (6)
2. Audit logs + compliance checks (4)
3. Installers + auto‑update (6)

**Acceptance:** Exportable delivery funnel + signed installers.

**Total estimate:** ~84 working days
