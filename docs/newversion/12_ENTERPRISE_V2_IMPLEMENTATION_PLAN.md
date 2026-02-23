# WABSender Enterprise V2 — Implementation Timeline, Effort, Risks & Migration Plan

Date: 2026-02-19  
Owner: Engineering (Platform + Desktop + Backend)  
Scope Source: `docs/newversion/00..11`

## 1) Executive Summary

This plan upgrades WABSender from Org-only architecture to Enterprise SaaS V2 with Org → Brand isolation, new contact intelligence, campaign tracking, automation engines (bots + flows), AI controls, and plan-based monetization controls.

### Target Outcomes
- Multi-brand SaaS-ready data model with strict tenant isolation.
- Campaign observability (sent/delivered/read/failed) and analytics dashboards.
- Automation-ready platform (reply bots + WhatsApp flows).
- Revenue controls through feature gating and quotas.
- Horizontal scale readiness through queue + websocket improvements.

### Delivery Strategy
- Incremental migrations + backward-compatible APIs.
- Feature flags for progressive rollout.
- Dual-read / dual-write where needed during transition windows.
- Rollback-safe DB migrations for each phase.

---

## 2) Assumptions and Constraints

### Assumptions
- Existing architecture remains: Electron + React frontend, Node + TypeScript backend, background workers, WebSocket realtime.
- Existing org data must be preserved without downtime-level migration risk.
- Current auth model (JWT + refresh) remains and is extended with brand context.

### Constraints
- Zero data loss.
- Backward compatibility for existing org-only clients during transition.
- Brand isolation must be enforced at API + DB query layers.
- Electron desktop compatibility must remain intact.

---

## 3) Recommended Execution Order (Aligned to Product Request)

1. Multi-brand layer (schema + middleware + context switch)
2. Contact management module
3. Campaign analytics/tracking V2
4. Reply bot engine
5. Plan gating
6. Flow engine
7. Performance/scaling optimization

---

## 4) Implementation Timeline (10 Weeks)

## Week 1–2: Phase A — Core Multi-Brand Refactor
### Deliverables
- DB: `brands` table + `brand_id` on `messages`, `campaigns`, `templates`, and new tables (`contacts`, `reply_bots`, `flows`).
- Migration script: create default brand per org and backfill `brand_id` for existing rows.
- Backend middleware: brand-aware context extraction + enforcement (`org_id`, `brand_id`).
- Frontend: brand switcher in desktop app header and persisted brand context.

### Exit Criteria
- All major read/write endpoints brand-filtered.
- Legacy org data accessible via default brand mapping.

## Week 3: Phase B — Contacts Module
### Deliverables
- DB: `contacts`, `groups`, `labels`, `group_contacts`, optional `contact_labels` join.
- APIs: contacts CRUD, groups CRUD, labels CRUD, bulk assignment.
- CSV import pipeline with validation + dedupe by brand.
- UI: Contacts page with search/filter/group/label targeting.

### Exit Criteria
- Campaign target resolver can fetch recipients by group/label/manual set.

## Week 4–5: Phase C — Campaign V2 Tracking + Analytics Base
### Deliverables
- DB: `campaign_messages` with status lifecycle and provider IDs.
- Worker updates: status transitions (sent, delivered, read, failed) + retry metadata.
- Webhook ingestion updates to map provider events to `campaign_messages`.
- Analytics API v1 for campaign performance and delivery/read rates.
- UI: campaign analytics view/widgets.

### Exit Criteria
- End-to-end campaign run produces trackable status funnel.

## Week 6: Phase D — Reply Bot Engine
### Deliverables
- DB: `reply_bots` table and bot execution logs.
- Bot matcher supports `EXACT_MATCH`, `CONTAINS`, `WELCOME`.
- Response action supports text/template payload.
- Inbound pipeline integration with webhook processing.

### Exit Criteria
- Bot can auto-respond correctly with deterministic priority rules.

## Week 7: Phase E — Plan Feature Gating
### Deliverables
- `plans` model + org/brand entitlements mapping.
- Middleware `checkPlan(feature)` for campaign, AI, bots, flows, agent creation, brand creation.
- Quota counters: message volume and monthly AI usage.

### Exit Criteria
- Restricted features correctly blocked and auditable.

## Week 8: Phase F — Flow Engine + Structured Response Capture
### Deliverables
- DB: `flows`, `flow_responses`.
- Webhook parsing for interactive flow payloads.
- APIs/UI for flow definition listing and response table.

### Exit Criteria
- Interactive flow submissions are persisted and queryable by brand.

## Week 9–10: Phase G — Scaling & Hardening
### Deliverables
- Redis pub/sub for websocket fanout and worker signaling.
- Retry/backoff policy standardization in queue workers.
- Message batching where provider/API allows.
- WebSocket reconnect stability improvements and load validation.
- Release hardening, regression tests, rollback drills.

### Exit Criteria
- Stable under concurrency/load targets with no tenant leakage.

---

## 5) Effort Estimate per Module (Engineering Weeks)

| Module | Backend | Frontend | QA/Automation | DevOps/Infra | Total Eng-Weeks |
|---|---:|---:|---:|---:|---:|
| Multi-brand core refactor | 3.0 | 1.0 | 1.0 | 0.5 | 5.5 |
| Contact management | 2.0 | 1.5 | 1.0 | 0.0 | 4.5 |
| Campaign V2 + analytics base | 2.5 | 1.5 | 1.0 | 0.5 | 5.5 |
| Reply bot engine | 1.5 | 1.0 | 1.0 | 0.0 | 3.5 |
| Plan feature gating | 1.5 | 0.5 | 0.8 | 0.0 | 2.8 |
| Flow engine | 1.5 | 1.0 | 0.8 | 0.0 | 3.3 |
| Performance/scaling | 2.0 | 0.2 | 1.0 | 1.5 | 4.7 |
| **Total** | **14.0** | **6.7** | **6.6** | **2.5** | **29.8** |

### Team Recommendation
- 2 backend engineers
- 1 frontend/electron engineer
- 1 QA automation engineer (shared)
- 0.5 DevOps capacity

With this staffing, ~10 weeks is realistic including stabilization.

---

## 6) Database Migration Plan (Zero Data Loss + Rollback)

## Migration Principles
- Use additive migrations first (new tables/columns nullable/defaulted).
- Backfill in id-ranged batches to avoid locks.
- Add constraints only after backfill verification.
- Keep rollback scripts for each migration step.

## Step-by-Step
1. Create `brands` table (`id`, `org_id`, `name`, `status`, provider ids).
2. For each org, insert default brand (`name = 'Default'`).
3. Add nullable `brand_id` columns to legacy tables.
4. Backfill `brand_id` on legacy rows via org→default brand map.
5. Add indexes `(org_id, brand_id, created_at)` where applicable.
6. Add foreign keys + set NOT NULL once backfill verified.
7. Deploy brand-aware API reads/writes.
8. Remove org-only query paths after observation window.

## Rollback Strategy
- If app regressions occur before NOT NULL/foreign key enforcement, rollback app version and keep additive schema.
- For hard rollback after constraints, use reverse migration scripts that drop constraints/indexes first, then columns only if safe.

## Data Validation Checklist
- Row counts before/after backfill per table.
- Null `brand_id` count = 0 on enforced tables.
- Cross-tenant leakage checks (randomized query audit).

---

## 7) Backend Implementation Plan

### Core Middleware
- Add `brandContextMiddleware` to resolve brand from token + header/session context.
- Enforce `org_id` + `brand_id` in repository/service layer.
- Introduce guard utility to prevent unscoped queries.

### New Services
- `contactsService` (CRUD/import/search/segment resolver).
- `campaignTrackingService` (status updates + metrics).
- `replyBotService` (trigger matching + response dispatch).
- `flowService` (definition and response capture).
- `planGateService` with `checkPlan(feature)`.

### Webhook Refactor
- Normalize inbound event pipeline:
  - Identify org + brand + number context.
  - Route event type (`message`, `status`, `interactive`).
  - Invoke bot/flow/campaign tracking handlers.

### Jobs/Queue
- Extend workers for campaign_messages lifecycle updates.
- Add retry categories (transient vs permanent failure).
- Add dead-letter handling + replay tooling.

---

## 8) Frontend / Electron Integration Plan

### Desktop App Updates
- Global brand switcher near navigation header.
- Persist selected brand context in local storage.
- All API calls include brand context metadata.
- Update views:
  - Contacts page (new)
  - Campaign analytics widgets
  - Bots management page
  - Flows page + response table
  - Plan-limit messaging states

### Backward Compatibility UX
- If org has one default brand, auto-select and hide complexity where possible.
- For legacy tenants, experience remains functionally equivalent.

---

## 9) Test Plan (Requested Modules)

### Unit Tests (Required)
1. Bot engine
- Exact/contains/welcome matching precedence.
- Template/text response resolution.
- Disabled bot and brand mismatch behavior.

2. Campaign tracking
- Status transitions and idempotency.
- Failed/delivered/read event reconciliation.
- Aggregation correctness for campaign stats.

3. Plan gating
- `checkPlan(feature)` for each gated capability.
- Quota exhaustion behavior.
- Plan upgrade/downgrade behavior.

### Integration Tests
- Brand isolation on all major endpoints.
- CSV import with malformed rows and dedupe logic.
- Webhook interactive payload capture into flow responses.

### Regression Suite
- Existing auth/login/activation/inbox/campaign baseline paths.

---

## 10) Risk Assessment & Mitigation

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Tenant data leakage due to missing brand filters | Critical | Medium | Centralized scoped-query utilities + mandatory middleware + query lint checks |
| Migration lock/contention on large tables | High | Medium | Batched backfills, off-peak runs, index strategy, dry-run on staging snapshot |
| Webhook event mapping inconsistencies | High | Medium | Event normalization layer + idempotency keys + replay tool |
| Queue retry storms / duplicate sends | High | Medium | Exponential backoff, retry caps, dedupe keys, DLQ alerts |
| Feature gating blocks valid users | Medium | Medium | Audit logs, shadow mode first, clear plan entitlement definitions |
| Desktop compatibility regressions | Medium | Low | Versioned API contracts + compatibility adapter during rollout |
| Analytics inaccuracies | Medium | Medium | Daily aggregation reconciliation jobs and metric integrity tests |

---

## 11) Release & Rollout Plan

### Stage 1 — Internal
- Deploy schema additive migrations + dark launch middleware.
- Enable brand context for internal orgs only.

### Stage 2 — Pilot Tenants
- Enable contact module + campaign tracking + analytics.
- Monitor webhook correctness and worker retries.

### Stage 3 — Controlled GA
- Enable bots, flows, and plan gating in feature-flag batches.
- Monitor quota enforcement and support tickets.

### Stage 4 — Scale Features
- Turn on Redis pub/sub fanout and queue optimizations.
- Conduct load + chaos validation.

---

## 12) Definition of Done (Per Phase)

A phase is complete only when:
- Schema migrated and validated (with rollback script tested).
- API and UI complete and behind controllable feature flag (if needed).
- Unit/integration tests pass for the module.
- Security/tenant isolation checks pass.
- Observability dashboards/alerts added for new critical paths.

---

## 13) Immediate Next Actions (Week 0 Prep)

1. Create detailed migration RFC with table-by-table SQL plan.
2. Add architecture decision records (ADRs) for brand context and plan gating.
3. Prepare staging dataset from production-like snapshot for migration rehearsal.
4. Implement a “brand scope required” lint/check in repository layer.
5. Break this plan into sprint tickets (epics + stories + acceptance criteria).

---

## 14) Deliverables Checklist Mapping to Request

- [x] Database migrations plan (with rollback strategy)
- [x] Backend service implementation plan
- [x] Frontend UI integration plan
- [x] Webhook refactor approach
- [x] Middleware updates (`brand context`, `checkPlan(feature)`)
- [x] Unit test scope (bot engine, campaign tracking, plan gating)
- [x] Timeline
- [x] Effort estimate by module
- [x] Risk assessment
- [x] Migration plan

This document is ready for engineering kickoff and sprint decomposition.
