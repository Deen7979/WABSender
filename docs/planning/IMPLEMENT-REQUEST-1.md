# Developer Implementation Request — Item 1

## Title
Implement End-to-End Conversation Reply Sending (Production Path)

## Background
We need to complete the reply/send flow so conversation replies are sent through the real WhatsApp Cloud API path (no simulation/TODO path), with consistent validation, persistence, status updates, and realtime events.

## Objective
Deliver a production-ready, end-to-end implementation for **conversation reply sending** by unifying route behavior with the robust message service flow.

## Scope
- Backend only (API + service + persistence + realtime behavior)
- No large UI redesign in this ticket
- Preserve existing API contract unless explicitly versioned

## Current Gaps to Address
1. `conversations.routes.ts` still contains a TODO/simulated send path for WhatsApp Cloud API.
2. Sending logic is split between route-level behavior and service-level behavior.
3. Need one authoritative sending path for reliability, retries, and observability.

## Required Implementation
1. **Route Unification**
   - Refactor `POST /conversations/:id/reply` to use `messageService.sendMessage(...)` as the primary send path.
   - Remove simulated/temporary send behavior.

2. **Validation Rules**
   - Keep/enforce template validation (approved/active only).
   - Keep/enforce 24-hour customer care window for free-text messages.
   - Validate conversation/org ownership and active WhatsApp account presence.

3. **Message Lifecycle & Status**
   - Persist outbound message with `sending` then transition to `sent`/`failed`.
   - Ensure `meta_message_id` is stored when returned.
   - Ensure `last_error` and `last_error_at` are written on failures.

4. **Realtime Event Consistency**
   - Broadcast consistent websocket events after send success/failure.
   - Align event payload shape with existing consumers (`ConversationDetail`, `ConversationList`).

5. **Error Handling**
   - Return structured errors for validation, external API failures, and retry exhaustion.
   - No sensitive token/vendor secrets in API responses.

6. **Observability**
   - Add clear logs for request entry, validation fail reasons, send attempts, retries, terminal outcome.
   - Include correlation identifiers (`messageId`, `conversationId`, `orgId`) in logs.

## Acceptance Criteria
- Reply endpoint sends real messages via WhatsApp API path, not simulation.
- Route uses `messageService` as single source of truth for sending.
- Free text outside 24h window is rejected with clear error.
- Template messages require allowed template status.
- DB message rows show correct status progression and errors.
- WebSocket consumers receive expected events after send result.
- Backward compatibility preserved for existing clients.

## Testing Requirements
- Unit tests for route-service integration branches:
  - template send success
  - text send success within window
  - text send blocked outside window
  - template invalid/not approved
  - no active WhatsApp account
  - transient failure with retry then success
  - permanent failure => failed status
- Integration test for `POST /conversations/:id/reply` full flow.
- Regression checks for conversation and inbox views consuming realtime events.

## Deliverables
- Updated route implementation (`conversations.routes.ts`)
- Any required message service updates (`messageService.ts`)
- Tests covering success/failure/retry paths
- Short implementation note in docs/release notes

## Non-Goals
- Smart reply/AI suggestions
- Rich media composer redesign
- New multi-account UI controls

## Priority & Estimate
- Priority: High
- Suggested estimate: 1–2 development days + 0.5 day QA

## Definition of Done
- Code merged
- Tests green in CI
- Manual smoke test completed in staging
- No TODO/simulated send path remains in conversation reply endpoint
