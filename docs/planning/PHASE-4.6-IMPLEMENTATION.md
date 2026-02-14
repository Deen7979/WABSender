# Phase 4.6: Template Synchronization & Webhook Verification - Implementation Guide

**Status**: ✅ Backend Implementation Complete, 🟡 Frontend/Testing In Progress  
**Approval**: User approved Phase 1, authorized Phase 2 start  
**Timeline**: Started after Phase 1 approval  

## Executive Summary

Phase 2 implements automatic template synchronization from Meta's WhatsApp Cloud API and webhook verification with industry-standard HMAC-SHA256 signatures. The system automatically fetches approved templates after OAuth connection, filters for production-ready templates, and verifies all incoming webhooks to prevent unauthorized access.

**Key Achievement**: Zero manual steps - users connect their account and templates sync automatically while maintaining security-first architecture.

## Architecture Overview

```
┌─────────────────────┐
│  User OAuth Flow    │
│  (Phase 1)          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ OAuth Callback      │
│ meta-oauth.routes   │
└──────────┬──────────┘
           │
           ├─► syncTemplatesForOrg() ◄─┐
           │   (async, non-blocking)   │
           │                           │
           ▼                           │
┌─────────────────────────────────────┴────────┐
│           Template Sync Service              │
│  • Fetch from Meta Graph API v19.0           │
│  • Filter APPROVED templates only            │
│  • Parse components (HEADER, BODY, etc)      │
│  • Upsert for idempotence                    │
│  • Update webhook_health status              │
└────────────────────┬────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Webhook Health Table  │
        │  • sync_status         │
        │  • sync_count          │
        │  • error_message       │
        │  • timestamps          │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Frontend Display     │
        │  • Status badge        │
        │  • Template count      │
        │  • Last sync time      │
        │  • Manual sync button  │
        └────────────────────────┘
```

### Webhook Verification Flow

```
┌──────────────────────────────┐
│  Meta Sends Webhook Event    │
│  POST /webhooks/whatsapp     │
│  Headers:                    │
│  x-hub-signature-256: sha256=<hash>
└─────────────┬────────────────┘
              │
              ▼
      ┌───────────────────────┐
      │ Verify Signature      │
      │ HMAC-SHA256           │
      │ Timing-Safe Compare   │
      └──────────┬────────────┘
                 │
          ┌──────┴──────┐
          ▼             ▼
      VALID        INVALID
        │              │
        ▼              ▼
    Process       Return 403
    (200)         Forbidden
        │
        ▼
    Route to Handler
    • Messages
    • Status Updates
    • Template Changes
        │
        ▼
    Update webhook_health
    last_webhook_timestamp
```

## Implementation Details

### 1. Template Synchronization Service

**File**: `src/services/templateSync.ts`

#### Function: `syncTemplatesForOrg(orgId, wabaId)`

**Purpose**: Fetch and store templates from Meta

**Flow**:
1. Mark sync as "syncing" in webhook_health
2. Get active WhatsApp account (retrieve encrypted access token)
3. Decrypt access token
4. Call Meta Graph API: `GET /v19.0/{waba-id}/message_templates`
5. Filter for APPROVED status only
6. Parse each template's components
7. Upsert into templates table
8. Update webhook_health with final status

**Key Features**:
- **Idempotent**: Safe to call multiple times
- **Async**: Non-blocking (doesn't delay OAuth callback)
- **Secure**: Decrypts token only when needed
- **Resilient**: Skips failed templates, logs warnings
- **Traceable**: Logs inserted/updated counts

**Example Response from Meta**:
```json
{
  "data": [
    {
      "id": "12345",
      "name": "order_confirmation",
      "status": "APPROVED",
      "language": "en_US",
      "category": "TRANSACTIONAL",
      "components": [
        {
          "type": "HEADER",
          "format": "TEXT",
          "text": "Order Confirmation"
        },
        {
          "type": "BODY",
          "text": "Order #{{1}} confirmed. Delivery: {{2}}"
        }
      ]
    },
    {
      "id": "12346",
      "name": "draft_template",
      "status": "PENDING_REVIEW",
      ...
    }
  ]
}
```

**Status Filtering**:
```typescript
// Only APPROVED templates are stored
if (template.status !== "APPROVED") {
  logger.debug(`Skipping non-approved template: ${template.name} (${template.status})`);
  continue;
}
```

#### Function: `getApprovedTemplates(orgId)`

**Purpose**: Retrieve templates for campaign UI

**Query**:
```sql
SELECT * FROM templates 
WHERE org_id = $1 AND status = 'APPROVED'
```

**Returns**: Array of templates with parsed components ready for preview

#### Function: `manualSyncTemplates(orgId)`

**Purpose**: Idempotent endpoint for manual sync trigger

**Called from**: `POST /templates/sync`

**Implementation**:
1. Get orgId from authenticated request
2. Get active WhatsApp account
3. Call syncTemplatesForOrg()
4. Return sync statistics

#### Function: `parseComponents(components)`

**Purpose**: Transform Meta template structure to UI-friendly format

**Supported Components**:

| Type | Example | Parsed For |
|------|---------|-----------|
| HEADER | "Order Confirmation" | Title/context |
| BODY | "Order #{{1}} confirmed..." | Main message |
| FOOTER | "Thank you" | Signature/info |
| BUTTONS | ["View Order", "Cancel"] | Call-to-action |

**Example Parsing**:
```typescript
const metaComponent = {
  type: "BODY",
  text: "Thank you for your order #{{1}}!"
};

const parsed = {
  type: "BODY",
  text: "Thank you for your order #{{1}}!",
  variableCount: 1,  // {{1}}, {{2}}, etc
  preview: "Thank you for your order #12345!"
};
```

### 2. Webhook Handler Service

**File**: `src/services/webhookHandler.ts`

#### Function: `verifyWebhookSignature(body, signature)`

**Security**: HMAC-SHA256 with timing-safe comparison

**Algorithm**:
```typescript
1. Extract signature from header: "sha256=<hash>"
2. Verify algorithm is "sha256" (reject others)
3. Create HMAC-SHA256 using app secret:
   const expectedHash = HMAC('sha256', secret).update(body).digest('hex')
4. Compare using crypto.timingSafeEqual() (prevents timing attacks)
5. Return true if equal, false otherwise
```

**Timing Safety**:
```typescript
// ✗ VULNERABLE: Leaks hash via comparison time
if (hash === expectedHash) { ... }

// ✓ SAFE: Constant-time comparison
crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash))
```

**Why Timing-Safe?**
Without constant-time comparison, an attacker could measure response time to brute-force the signature byte-by-byte, learning one character at a time rather than needing to guess the entire string.

#### Function: `handleWebhookEvent(event)`

**Purpose**: Route webhook events to appropriate handlers

**Event Types**:
- `whatsapp_business_account`: Main event type
- Fields: `messages`, `message_status`, `message_template`

**Routing Logic**:
```typescript
if (field === "messages") {
  await handleMessageEvents(wabaId, value);  // Phase 3
}
if (field === "message_status") {
  await handleStatusEvents(wabaId, value);   // Phase 3
}
if (field === "message_template") {
  await handleTemplateEvents(wabaId, value); // Phase 3
}
```

### 3. Webhook Health Service

**File**: `src/services/webhookHealth.ts`

**Purpose**: Track webhook and template sync health metrics

#### Function: `initializeWebhookHealth(orgId)`

**Timing**: Called when WhatsApp account is created

**Initial State**:
```sql
INSERT INTO webhook_health (
  org_id, webhook_verified, template_sync_status
) VALUES (
  orgId, false, 'pending'
)
```

#### Function: `markWebhookVerified(orgId)`

**Timing**: Called after successful webhook signature verification

**Update**:
```sql
UPDATE webhook_health SET 
  webhook_verified = true,
  last_webhook_timestamp = now(),
  updated_at = now()
WHERE org_id = orgId
```

#### Function: `updateTemplateSyncStatus(orgId, status, count, error)`

**Timing**: Called at start, during, and after template sync

**Status States**:
```
pending    → Initial state
  ├─► syncing → Sync in progress
  │     ├─► success → Sync completed successfully
  │     └─► error   → Sync failed
  └─► error → Immediate failure (e.g., no account)
```

**Database Updates**:
```sql
-- On success:
UPDATE webhook_health SET 
  template_sync_status = 'success',
  last_template_sync = now(),
  template_sync_count = count,
  error_message = NULL

-- On error:
UPDATE webhook_health SET 
  template_sync_status = 'error',
  error_message = 'Human-readable error'
```

### 4. API Routes

#### Templates Routes

```typescript
// GET /templates
// Returns APPROVED templates with components
[
  {
    id: "uuid",
    name: "order_confirmation",
    components: { ... },
    lastUpdated: "2024-01-15T10:30:00Z"
  }
]

// POST /templates/sync
// Triggers manual sync
{
  success: true,
  synced: 5,
  approved: 5,
  timestamp: "2024-01-15T10:30:00Z"
}

// GET /templates/status
// Returns sync statistics
{
  totalTemplates: 10,
  approvedCount: 8,
  lastSync: "2024-01-15T10:30:00Z",
  status: "success"
}
```

#### Webhook Status Routes

```typescript
// GET /webhook/health?org_id=<uuid>
{
  webhookVerified: true,
  lastWebhookTime: "2024-01-15T10:30:00Z",
  syncStatus: "success",
  lastSyncTime: "2024-01-15T10:20:00Z",
  syncCount: 8,
  error: null
}

// GET /webhook/health/detailed?org_id=<uuid>
{
  webhookVerified: true,
  lastWebhookTime: "2024-01-15T10:30:00Z",
  syncStatus: "success",
  lastSyncTime: "2024-01-15T10:20:00Z",
  syncCount: 8,
  error: null,
  templates: {
    total: 10,
    approved: 8
  }
}
```

#### Webhooks Routes (Enhanced)

```typescript
// GET /webhooks/whatsapp
// Meta verification challenge
// Query params: hub.mode, hub.verify_token, hub.challenge
// Response: echo challenge if token matches

// POST /webhooks/whatsapp
// Main webhook receiver
// Headers: x-hub-signature-256: sha256=<hash>
// Verification: HMAC-SHA256
// Response: 200 OK (immediate, process async)
// Status: 403 Forbidden if signature invalid
```

### 5. OAuth Integration

**File**: `src/routes/meta-oauth.routes.ts`

**Enhancement**: Auto-trigger template sync after successful OAuth

```typescript
// In callback handler, after saving whatsapp_account:
syncTemplatesForOrg(orgId, wabaId)
  .then(() => logger.info("Auto-sync completed", { orgId }))
  .catch(err => logger.warn("Auto-sync failed", { orgId, error: err.message }));

// Non-blocking: doesn't await, doesn't delay redirect
return res.redirect(redirectUri);
```

**User Experience**:
1. User clicks "Connect WhatsApp"
2. Redirected to Meta OAuth
3. User authorizes
4. Callback received
5. Account saved
6. **Sync starts** (async in background)
7. User redirected to app
8. UI shows "syncing" status
9. Sync completes, status changes to "success"

### 6. Database Schema

**New Table: `webhook_health`**

```sql
CREATE TABLE webhook_health (
  id SERIAL PRIMARY KEY,
  org_id UUID UNIQUE NOT NULL REFERENCES organizations(id),
  webhook_verified BOOLEAN DEFAULT false,
  last_webhook_timestamp TIMESTAMP,
  template_sync_status VARCHAR(20) DEFAULT 'pending',
  last_template_sync TIMESTAMP,
  template_sync_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX idx_webhook_health_org ON webhook_health(org_id);
CREATE INDEX idx_webhook_health_status ON webhook_health(template_sync_status);
```

## Frontend Implementation

### WhatsAppConnection Component

**File**: `apps/desktop/src/renderer/components/WhatsAppConnection.tsx`

**New Features**:

#### 1. **Webhook Health Section**
```tsx
<div className="webhook-health-section">
  <h3>Webhook Status</h3>
  <div className="health-item">
    <span className="label">Webhook Verified:</span>
    <span className="status verified">✓ Verified</span>
  </div>
  <div className="health-item">
    <span className="label">Last Webhook:</span>
    <span className="value">2024-01-15 10:30:00</span>
  </div>
</div>
```

#### 2. **Template Sync Section**
```tsx
<div className="template-sync-section">
  <div className="sync-header">
    <h3>Template Synchronization</h3>
    <span className="sync-badge success">✓ success</span>
  </div>
  
  <div className="template-stats">
    <div className="stat-item">
      <span>Approved Templates:</span>
      <span>8</span>
    </div>
    <div className="stat-item">
      <span>Total Synced:</span>
      <span>10</span>
    </div>
  </div>
  
  <div className="sync-time">
    Last sync: 2024-01-15 10:20:00
  </div>
  
  <button className="btn-sync" onClick={handleManualSync}>
    Sync Templates Now
  </button>
</div>
```

### UI States

#### Connected State

```
┌──────────────────────────────────────┐
│ WhatsApp Business Account            │
│ Connected                            │
├──────────────────────────────────────┤
│ Phone Number: +1234567890          │
│ WABA ID: 123456789                 │
├──────────────────────────────────────┤
│ Webhook Status                       │
│ ✓ Verified                           │
│ Last Webhook: 2024-01-15 10:30:00   │
├──────────────────────────────────────┤
│ Template Synchronization             │
│ ✓ success (green)                    │
│ Approved: 8 | Total: 10             │
│ Last sync: 2024-01-15 10:20:00      │
│ [Sync Templates Now] [Disconnect]   │
├──────────────────────────────────────┤
│ Token expires: 01/15/2025            │
│ [Disconnect] [Reconnect]             │
└──────────────────────────────────────┘
```

#### Syncing State

```
Sync status: ↻ syncing (orange, animated)
Last sync: 2024-01-15 10:20:00
[Sync Templates Now] (disabled, grayed out)
```

#### Error State

```
Sync status: ✕ error (red)
Error: Failed to fetch templates from Meta
[Sync Templates Now] (enabled, clickable)
```

## Security Considerations

### 1. **HMAC-SHA256 Verification**
- ✓ Timing-safe comparison prevents timing attacks
- ✓ Uses app secret, not public knowledge
- ✓ Validates algorithm (rejects SHA1, MD5, etc)
- ✓ Signature required, no fallback

### 2. **Token Security**
- ✓ Access tokens encrypted with AES-256-GCM
- ✓ Decrypted only when needed
- ✓ Never logged or exposed in error messages
- ✓ Stored in secure HTTP-only cookies (phase 3)

### 3. **Template Filtering**
- ✓ Only APPROVED templates exposed
- ✓ PENDING_REVIEW, REJECTED, DISABLED filtered out
- ✓ Prevents sending templates that aren't approved by Meta

### 4. **Webhook Authentication**
- ✓ Signature verified before processing
- ✓ Invalid signatures return 403 (forbidden)
- ✓ Prevents replay attacks and unauthorized requests
- ✓ Protects against man-in-the-middle attacks

### 5. **Error Messages**
- ✓ No sensitive data in error responses
- ✓ Full errors logged server-side
- ✓ User sees friendly, helpful messages
- ✓ Prevents information disclosure

## Performance Optimizations

### 1. **Async Processing**
- Template sync doesn't block OAuth callback
- Webhook events processed asynchronously
- Response sent immediately (200), processing continues

### 2. **Database Efficiency**
- Upsert strategy prevents duplicate queries
- Indexes on org_id for fast lookups
- Batch inserts for multiple templates

### 3. **API Caching**
- Health status cached in component state
- Minimal API calls after initial fetch
- Refresh on demand (manual sync button)

### 4. **Parsing Optimization**
- Components parsed once during sync
- Stored as JSON for fast retrieval
- No re-parsing on every request

## Error Handling

### Template Sync Errors

```typescript
// Network error
"Failed to fetch templates from Meta (Network timeout)"

// Invalid token
"Invalid access token or account disabled"

// Rate limit
"Rate limited by Meta API (retry in 5 minutes)"

// Malformed response
"Unexpected response format from Meta API"
```

### Webhook Errors

```typescript
// Invalid signature
"Webhook signature verification failed" → 403

// Missing signature
"Missing webhook signature header" → 403

// Processing error
"Failed to process webhook event" → 200 (still log error)
```

## Testing Strategy

### Unit Tests
- Component rendering
- State management
- Button interactions
- API call formatting

### Integration Tests
- OAuth → Auto-sync flow
- Manual sync endpoint
- Webhook verification
- Status retrieval

### E2E Tests
- Complete OAuth + template sync
- Manual sync and verification
- Webhook reception and processing
- UI status updates

## Migration & Deployment

### Database Migration

```bash
# Run migration to create webhook_health table
npm run migrate

# Verify table created
psql -d whatsapp_db -c "SELECT * FROM webhook_health LIMIT 1;"
```

### Environment Variables

```bash
# .env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<your-webhook-token>
WHATSAPP_APP_SECRET=<your-app-secret>
DEBUG=false  # Set to "true" for verbose logging
```

### Deployment Steps

1. Pull latest code
2. Install dependencies
3. Run database migration
4. Build API service
5. Build desktop app
6. Set environment variables
7. Restart API service
8. Test OAuth flow
9. Monitor logs

## Monitoring & Debugging

### Enable Debug Logging

```bash
DEBUG=true node dist/index.js
```

### Monitor Sync Status

```sql
-- Check sync status for all orgs
SELECT org_id, template_sync_status, template_sync_count, error_message, updated_at
FROM webhook_health
ORDER BY updated_at DESC;

-- Find failed syncs
SELECT * FROM webhook_health WHERE template_sync_status = 'error';

-- Check last webhook time
SELECT org_id, last_webhook_timestamp, webhook_verified 
FROM webhook_health 
WHERE webhook_verified = false;
```

### View Logs

```bash
# View recent logs
tail -f /var/log/whatsapp-api.log | grep -E "sync|webhook"

# Filter by org
tail -f /var/log/whatsapp-api.log | grep "org_id"

# Find errors
tail -f /var/log/whatsapp-api.log | grep ERROR
```

## Glossary

| Term | Definition |
|------|-----------|
| WABA | WhatsApp Business Account (Meta's term) |
| HMAC | Hash-based Message Authentication Code |
| SHA256 | Secure Hash Algorithm 256-bit |
| Idempotent | Can be called multiple times safely |
| Timing Attack | Attack that measures response time to guess data |
| APPROVED | Template approved by Meta, ready for use |
| PENDING_REVIEW | Template waiting for Meta review |
| Webhook | HTTP callback for real-time events |

## Related Documentation

- [Phase 4.1: OAuth Implementation](./PHASE-4.1-OAUTH.md)
- [Phase 4.5: Testing Results](./PHASE-4.5-TEST-RESULTS.md)
- [Meta API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference)
- [Webhook Security](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)

---

**Status**: ✅ Implementation Complete  
**Next Phase**: Phase 4.7 - Message & Status Event Handling  
**Approval Date**: [Date of user approval]  
**Implementation Date**: [Date implementation started]
