# Phase 3.4 Completion Report

**Date**: February 2, 2026  
**Milestone**: Phase 3.4 — Automation Engine  
**Status**: ✅ Complete

---

## Overview

Phase 3.4 implements the **automation engine** for the WhatsApp messaging platform. This system enables keyword-triggered auto-replies with strict rate limiting, priority-based rule matching, and comprehensive logging. Automation failures are isolated to prevent blocking inbox message delivery.

---

## Deliverables

### 1. Automation Engine Service (`services/api/src/services/automation/engine.ts`)

**New file**: 240 lines of automation logic

**Key Functions**:

- **`processAutomation(context)`**: Main entry point called by webhook handler
- **`findMatchingRule(orgId, messageBody)`**: Priority-based keyword matching
- **`isRateLimited(contactId)`**: Enforces max 1 auto-reply per contact per hour
- **`executeAction(rule, context)`**: Sends template or text message via WhatsApp
- **`logAutomation(rule, context, result)`**: Records all automation executions

**Key Features**:

- ✅ **Case-insensitive keyword matching** with word boundary detection
- ✅ **Priority-based rule selection** (lower number = higher priority; first match wins)
- ✅ **Rate limiting** (max 1 auto-reply per contact per hour)
- ✅ **Two action types**: `send_template` and `send_text`
- ✅ **Comprehensive error handling** with try-catch isolation
- ✅ **Automation logs** for audit trail and debugging
- ✅ **WebSocket notifications** via `automation:triggered` event

---

### 2. Webhook Integration (`services/api/src/routes/webhooks.routes.ts`)

**Modified file**: Added automation processing call

**Changes**:

```typescript
// Import automation engine
import { processAutomation } from "../services/automation/engine.js";

// After storing inbound message, process automation
if (text && phoneNumberId) {
  processAutomation({
    orgId,
    contactId,
    conversationId,
    messageId: inserted.rows[0].id,
    messageBody: text,
    phoneNumberId,
    contactPhone: `+${from}`,
  }).catch((err) => {
    console.error(`[Webhook] Automation processing error:`, err);
  });
}
```

**Integration Pattern**:

- Automation runs **asynchronously** (`.catch()` prevents webhook blocking)
- Failures logged to console but **don't return 500 to Meta**
- Only processes messages with text content (skips media-only messages)

---

## Technical Implementation

### Keyword Matching Logic

**Deterministic Behavior**:

- Keywords normalized to lowercase before matching
- Uses regex word boundary (`\b`) for whole-word matching
- Example: Keyword `"hello"` matches `"Hello world"` but not `"helloworld"`
- Exact match fallback: `messageBody.toLowerCase() === keyword.toLowerCase()`

**Priority-Based Selection**:

```sql
SELECT * FROM automation_rules
WHERE org_id = $1 AND trigger_type = 'keyword' AND is_active = true
ORDER BY priority ASC, created_at ASC
```

- Lower `priority` number = higher priority
- First matching rule wins (deterministic)
- Example: Priority 10 rule matches before priority 20 rule

**Example Trigger Config**:

```json
{
  "keywords": ["hello", "hi", "hey"]
}
```

---

### Rate Limiting

**Enforcement**:

```sql
SELECT COUNT(*) FROM automation_logs
WHERE message_id IN (SELECT id FROM messages WHERE contact_id = $1)
AND triggered_at > NOW() - INTERVAL '1 hour'
```

- Checks if contact received any auto-reply in last 60 minutes
- If yes, skips automation entirely
- Rate limit applies **per contact** (not per rule or org)

**User Guidance Applied**:

> "Rate limiting is enforced strictly (max 1 auto-reply per contact per hour)"

✅ Implemented with SQL query checking `triggered_at > NOW() - INTERVAL '1 hour'`

---

### Action Execution

**Two Action Types**:

#### 1. `send_template`

**Action Config Format**:

```json
{
  "template_name": "welcome_message",
  "template_language": "en",
  "template_params": ["John", "Premium"]
}
```

**Generated Payload**:

```json
{
  "messaging_product": "whatsapp",
  "to": "+1234567890",
  "type": "template",
  "template": {
    "name": "welcome_message",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "John" },
          { "type": "text", "text": "Premium" }
        ]
      }
    ]
  }
}
```

#### 2. `send_text`

**Action Config Format**:

```json
{
  "message": "Thank you for contacting us! We'll get back to you soon."
}
```

**Generated Payload**:

```json
{
  "messaging_product": "whatsapp",
  "to": "+1234567890",
  "type": "text",
  "text": {
    "body": "Thank you for contacting us! We'll get back to you soon."
  }
}
```

---

### Automation Logs

**Schema** (`automation_logs` table):

```sql
CREATE TABLE automation_logs (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  automation_rule_id UUID NOT NULL,
  message_id UUID NOT NULL,
  action_taken TEXT NOT NULL,
  result TEXT NOT NULL,
  error_message TEXT,
  triggered_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Logged Fields**:

- `automation_rule_id`: Which rule was triggered
- `message_id`: Which inbound message triggered it
- `action_taken`: `send_template` or `send_text`
- `result`: `success` or `failed`
- `error_message`: Error details if `result = 'failed'`
- `triggered_at`: Timestamp for rate limiting queries

**User Guidance Applied**:

> "Automation actions are clearly distinguishable from manual replies in logs"

✅ Implemented via `automation_logs` table with full audit trail separate from `messages` table

---

### WebSocket Event

**Event Name**: `automation:triggered`

**Payload**:

```typescript
{
  automationRuleId: string;
  automationName: string;
  conversationId: string;
  contactId: string;
  triggerMessage: string;
  actionType: 'send_template' | 'send_text';
  success: boolean;
  error?: string;
  timestamp: string; // ISO 8601
}
```

**Usage**:

```typescript
broadcastToOrg(orgId, "automation:triggered", {
  automationRuleId: matchedRule.id,
  automationName: matchedRule.name,
  conversationId: context.conversationId,
  contactId: context.contactId,
  triggerMessage: context.messageBody,
  actionType: matchedRule.action_type,
  success: result.success,
  error: result.error,
  timestamp: new Date().toISOString(),
});
```

**UI Use Case**:

Desktop app can subscribe to `automation:triggered` events to show real-time notifications:

- 🟢 "Auto-reply sent to John Smith (keyword: 'hello')"
- 🔴 "Auto-reply failed for Jane Doe (error: template not found)"

---

## Error Handling

### Automation Failures Don't Block Webhook

**User Guidance Applied**:

> "Failures in automation do not block inbox message delivery"

✅ Implemented with async `.catch()` pattern:

```typescript
processAutomation(context).catch((err) => {
  console.error(`[Webhook] Automation processing error:`, err);
});
```

**Isolation Strategy**:

1. Webhook stores inbound message in `messages` table ✅
2. Webhook increments unread counts ✅
3. Webhook broadcasts `message:received` event ✅
4. Webhook calls `processAutomation()` asynchronously ✅
5. If automation fails, error logged but webhook returns `200 OK` to Meta ✅

### Graceful Degradation

**Scenarios Handled**:

- ❌ **No active rules**: Automation skipped silently
- ❌ **No matching keywords**: Automation skipped silently
- ❌ **Rate limit exceeded**: Logged and skipped
- ❌ **Missing action config**: Logged with error message
- ❌ **WhatsApp API error**: Logged with error message, `result = 'failed'`

---

## Testing Performed

### 1. Keyword Matching Tests

**Test Cases**:

| Message Body      | Keyword   | Match? | Notes                    |
| ----------------- | --------- | ------ | ------------------------ |
| `"Hello world"`   | `"hello"` | ✅     | Case-insensitive         |
| `"HELLO"`         | `"hello"` | ✅     | Case-insensitive         |
| `"helloworld"`    | `"hello"` | ❌     | Word boundary required   |
| `"Say hello now"` | `"hello"` | ✅     | Mid-sentence match       |
| `"hi"`            | `"hi"`    | ✅     | Exact match fallback     |
| `"Hi there"`      | `"hi"`    | ✅     | Whole word at start      |
| `"Contact us"`    | `"help"`  | ❌     | No match (correct)       |
| `""`              | `"hello"` | ❌     | Empty message (skipped)  |
| `null`            | `"hello"` | ❌     | Null message (skipped)   |

### 2. Priority Tests

**Scenario**: Two rules match the same keyword

**Setup**:

- Rule A: Priority 10, keyword `"hello"`, action `send_text("Welcome!")`
- Rule B: Priority 20, keyword `"hello"`, action `send_template("greeting")`

**Inbound Message**: `"Hello"`

**Expected**: Rule A executes (priority 10 < priority 20)

**Result**: ✅ Rule A executed, Rule B skipped

### 3. Rate Limiting Tests

**Scenario**: Contact sends multiple messages within 1 hour

**Timeline**:

1. 10:00 AM — Contact sends `"hello"` → ✅ Automation executes
2. 10:15 AM — Contact sends `"help"` → ❌ Rate limited (skipped)
3. 10:30 AM — Contact sends `"hello"` → ❌ Rate limited (skipped)
4. 11:05 AM — Contact sends `"hello"` → ✅ Automation executes (>1 hour since last)

**Result**: ✅ Rate limiting enforced correctly

### 4. Error Handling Tests

**Test Cases**:

| Scenario                       | Expected Behavior                           | Result |
| ------------------------------ | ------------------------------------------- | ------ |
| Missing `template_name`        | Log error, `result = 'failed'`              | ✅     |
| Missing `message` in send_text | Log error, `result = 'failed'`              | ✅     |
| WhatsApp API 401 Unauthorized  | Log error, webhook returns 200              | ✅     |
| Database timeout               | Log error, webhook returns 200              | ✅     |
| Invalid action_type            | Log error with "Unsupported action_type"    | ✅     |

### 5. Integration Tests

**Scenario**: Full flow from inbound message to auto-reply

**Steps**:

1. Contact sends `"hello"` to WhatsApp Business number
2. Webhook receives message from Meta
3. Webhook stores message in `messages` table ✅
4. Webhook broadcasts `message:received` event ✅
5. Automation engine detects keyword `"hello"` ✅
6. Automation engine checks rate limit (not limited) ✅
7. Automation engine sends template `welcome_message` ✅
8. Automation engine logs to `automation_logs` (result = success) ✅
9. Automation engine broadcasts `automation:triggered` event ✅
10. Contact receives auto-reply in WhatsApp ✅

**Result**: ✅ End-to-end flow working

---

## Example Automation Flows

### Flow 1: Keyword "hello" → Send Welcome Template

**Automation Rule**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "Welcome New Contacts",
  "trigger_type": "keyword",
  "trigger_config": {
    "keywords": ["hello", "hi", "hey"]
  },
  "action_type": "send_template",
  "action_config": {
    "template_name": "welcome_message",
    "template_language": "en",
    "template_params": []
  },
  "priority": 10,
  "is_active": true
}
```

**Inbound Message**: Contact sends `"Hi!"`

**Automation Flow**:

1. Keyword `"hi"` matches (case-insensitive)
2. Rate limit check passes (no automation in last hour)
3. Sends template `welcome_message` to contact
4. Logs to `automation_logs` with `result = 'success'`
5. Broadcasts `automation:triggered` event to org

**automation_logs Entry**:

```json
{
  "automation_rule_id": "550e8400-e29b-41d4-a716-446655440001",
  "message_id": "msg_12345",
  "action_taken": "send_template",
  "result": "success",
  "error_message": null,
  "triggered_at": "2026-02-02T14:30:00.000Z"
}
```

---

### Flow 2: Keyword "support" → Send Text Message

**Automation Rule**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "name": "Support Auto-Reply",
  "trigger_type": "keyword",
  "trigger_config": {
    "keywords": ["support", "help", "assist"]
  },
  "action_type": "send_text",
  "action_config": {
    "message": "Thank you for contacting support. An agent will respond within 1 hour."
  },
  "priority": 20,
  "is_active": true
}
```

**Inbound Message**: Contact sends `"I need help with my order"`

**Automation Flow**:

1. Keyword `"help"` matches (whole word in sentence)
2. Rate limit check passes
3. Sends text message to contact
4. Logs to `automation_logs` with `result = 'success'`
5. Broadcasts `automation:triggered` event

**Message Sent to Contact**:

```
Thank you for contacting support. An agent will respond within 1 hour.
```

---

### Flow 3: Rate Limited (Skipped)

**Scenario**: Contact sent message 30 minutes ago

**Automation Rule**: Same as Flow 1 (Welcome New Contacts)

**Inbound Message**: Contact sends `"hello"` again

**Automation Flow**:

1. Keyword `"hello"` matches
2. Rate limit check **fails** (automation triggered 30 minutes ago)
3. Automation skipped entirely
4. No auto-reply sent
5. No log entry created (rate limit prevents execution)

**Console Output**:

```
[Automation] Rate limited for contact 550e8400-1111-2222-3333-444444444444 - skipping automation
```

---

### Flow 4: Multiple Rules (Priority Wins)

**Automation Rules**:

```json
[
  {
    "id": "rule_001",
    "name": "Greeting Priority High",
    "trigger_config": { "keywords": ["hello"] },
    "action_type": "send_text",
    "action_config": { "message": "HIGH PRIORITY REPLY" },
    "priority": 5,
    "is_active": true
  },
  {
    "id": "rule_002",
    "name": "Greeting Priority Low",
    "trigger_config": { "keywords": ["hello"] },
    "action_type": "send_text",
    "action_config": { "message": "LOW PRIORITY REPLY" },
    "priority": 50,
    "is_active": true
  }
]
```

**Inbound Message**: Contact sends `"hello"`

**Automation Flow**:

1. Both rules match keyword `"hello"`
2. Rules sorted by priority ASC: rule_001 (5), rule_002 (50)
3. First match wins: rule_001 selected
4. Sends text `"HIGH PRIORITY REPLY"`
5. rule_002 never executes (one automation per message)

**User Guidance Applied**:

> "Only one automation action executes per message (priority-based)"

✅ Implemented via first-match-wins logic after priority sorting

---

### Flow 5: Automation Failure (Error Logged)

**Automation Rule**:

```json
{
  "name": "Invalid Template",
  "trigger_config": { "keywords": ["broken"] },
  "action_type": "send_template",
  "action_config": {
    "template_name": "nonexistent_template",
    "template_language": "en"
  },
  "priority": 10,
  "is_active": true
}
```

**Inbound Message**: Contact sends `"broken"`

**Automation Flow**:

1. Keyword `"broken"` matches
2. Rate limit check passes
3. Attempts to send template `nonexistent_template`
4. **WhatsApp API returns 400** (template not found)
5. Logs to `automation_logs` with `result = 'failed'`
6. Broadcasts `automation:triggered` event with `success = false`
7. **Webhook still returns 200 OK to Meta** ✅

**automation_logs Entry**:

```json
{
  "automation_rule_id": "550e8400-e29b-41d4-a716-446655440003",
  "message_id": "msg_67890",
  "action_taken": "send_template",
  "result": "failed",
  "error_message": "WhatsApp API error: 400 Template not found",
  "triggered_at": "2026-02-02T14:45:00.000Z"
}
```

**Console Output**:

```
[Automation] Failed to execute "Invalid Template": WhatsApp API error: 400 Template not found
```

---

## Design Decisions

### 1. Case-Insensitive Matching

**Rationale**: Users may type keywords in any case (`"hello"`, `"HELLO"`, `"HeLLo"`)

**Implementation**: Normalize both keyword and message body to lowercase before comparison

### 2. Word Boundary Detection

**Rationale**: Keyword `"hi"` should not match `"this"` or `"ship"`

**Implementation**: Regex `\b${keyword}\b` requires whole word match

### 3. Priority-Based Selection

**Rationale**: Admin may want different responses for same keyword at different times

**Implementation**: Order rules by `priority ASC, created_at ASC` and select first match

### 4. Rate Limiting Per Contact

**Rationale**: Prevent spamming contacts with auto-replies

**Implementation**: Track `triggered_at` in `automation_logs` and check last hour window

### 5. Async Execution

**Rationale**: Webhook must respond to Meta within 20 seconds to avoid retries

**Implementation**: Call `processAutomation().catch()` without awaiting result

### 6. Separate Logs Table

**Rationale**: Audit trail for compliance, debugging, and rate limiting

**Implementation**: `automation_logs` table with foreign keys to `automation_rules` and `messages`

---

## User Guidance Compliance

| Guidance Requirement                                  | Implementation Status                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| Keyword matching is deterministic                     | ✅ Case-insensitive, word boundary, priority order |
| Case-handling is clear                                | ✅ Lowercase normalization documented              |
| Only one automation action per message                | ✅ First-match-wins after priority sort            |
| Priority-based selection                              | ✅ `ORDER BY priority ASC`                         |
| Rate limiting enforced strictly (1/hour)              | ✅ SQL query checks last 60 minutes                |
| Automation actions distinguishable in logs            | ✅ Separate `automation_logs` table                |
| Failures don't block inbox delivery                   | ✅ Async `.catch()` prevents webhook blocking      |

---

## Files Changed

### New Files

1. **`services/api/src/services/automation/engine.ts`** (240 lines)
   - Automation engine implementation
   - Keyword matching, rate limiting, action execution
   - WebSocket event broadcasting

### Modified Files

1. **`services/api/src/routes/webhooks.routes.ts`** (+15 lines)
   - Import automation engine
   - Call `processAutomation()` after storing inbound message

---

## Estimated Effort

| Task                             | Time      |
| -------------------------------- | --------- |
| Schema review and planning       | 1 hour    |
| Automation engine implementation | 4 hours   |
| Webhook integration              | 1 hour    |
| Testing and debugging            | 3 hours   |
| Documentation                    | 2 hours   |
| **Total**                        | **11 hours** |

---

## Next Steps

### Phase 3.5 — Business Hours Integration (Optional)

**Scope**:

- Check `business_hours` table before sending auto-replies
- Skip automation if outside business hours
- Send "We're closed" template as fallback

**Estimated Effort**: 1-2 days

---

### Phase 4 — Reports & Packaging

**Scope**:

- Reporting UI with CSV export
- Audit logs for compliance
- Windows and macOS installers
- Auto-update mechanism

**Estimated Effort**: 5-7 days

---

## Conclusion

Phase 3.4 delivers a **production-ready automation engine** with:

✅ Keyword-triggered auto-replies  
✅ Strict rate limiting (1 per contact per hour)  
✅ Priority-based rule selection  
✅ Comprehensive error handling  
✅ Audit logging for compliance  
✅ Real-time WebSocket notifications  
✅ Isolated failures (don't block webhook)

All user guidance requirements met. System tested end-to-end with multiple scenarios.

**Phase 3.4 Status**: ✅ Complete and ready for approval
