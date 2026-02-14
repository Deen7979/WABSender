# Phase 4.6: Template Synchronization & Webhook Verification - Testing Plan

**Status**: In Development  
**Target Release**: When all tests pass  
**Phase Dependency**: Phase 4.1 (OAuth) ✅ Complete

## Overview

This phase implements automatic template synchronization from Meta's WhatsApp Cloud API and webhook verification with HMAC-SHA256 signatures. Users can connect their WhatsApp account, automatically fetch templates, and see real-time sync status.

## Completed Components

### Backend Services

#### 1. **Template Synchronization** (`src/services/templateSync.ts`)
- **`syncTemplatesForOrg(orgId, wabaId)`**: Fetches templates from Meta Graph API v19.0
  - Filters for APPROVED templates only
  - Parses components (HEADER, BODY, FOOTER, BUTTONS)
  - Upserts templates for idempotence
  - Updates webhook_health sync status
  
- **`getApprovedTemplates(orgId)`**: Returns templates for campaign UI
  - Only returns APPROVED status templates
  - Includes parsed components for message preview
  
- **`manualSyncTemplates(orgId)`**: Idempotent manual sync trigger
  - Called from POST /templates/sync endpoint
  - Can be triggered multiple times safely
  
- **`parseComponents(components)`**: Parses Meta template structure
  - Converts HEADER, BODY, FOOTER, BUTTONS into preview-friendly format
  - Preserves variable placeholders for dynamic content

#### 2. **Webhook Handler** (`src/services/webhookHandler.ts`)
- **`verifyWebhookSignature(body, signature)`**: HMAC-SHA256 verification
  - Uses `crypto.timingSafeEqual()` to prevent timing attacks
  - Validates signature algorithm (sha256 required)
  - Returns boolean for signature validity
  
- **`handleWebhookEvent(event)`**: Event routing dispatcher
  - Routes messages to handleMessageEvents()
  - Routes statuses to handleStatusEvents()
  - Routes templates to handleTemplateEvents()
  - Comprehensive error logging

- **Event Handlers** (Stubs for Phase 3):
  - `handleMessageEvents()`: Processes incoming messages
  - `handleStatusEvents()`: Processes delivery status updates
  - `handleTemplateEvents()`: Processes template status changes

#### 3. **Webhook Health Tracking** (`src/services/webhookHealth.ts`)
- **`initializeWebhookHealth(orgId)`**: Creates health record on org creation
- **`markWebhookVerified(orgId)`**: Updates verification status
- **`updateTemplateSyncStatus(orgId, status, count, error)`**: Tracks sync state
- **`getWebhookHealth(orgId)`**: Retrieves full health status

**Status Types**: `pending | syncing | success | error`

### API Routes

#### 1. **Templates Routes** (`src/routes/templates.routes.ts`)
```
GET  /templates              → Get APPROVED templates only
POST /templates/sync         → Trigger manual sync
GET  /templates/status       → Get sync statistics
```

#### 2. **Webhook Status Routes** (`src/routes/webhook-status.routes.ts`)
```
GET  /webhook/health         → Get basic health status
GET  /webhook/health/detailed → Get health + template counts
```

#### 3. **Webhooks Routes** (Enhanced)
```
GET  /webhooks/whatsapp      → Meta webhook verification challenge
POST /webhooks/whatsapp      → Main webhook receiver with HMAC verification
```

#### 4. **OAuth Routes** (Enhanced)
- Callback now auto-triggers `syncTemplatesForOrg()` asynchronously
- Non-blocking (doesn't delay OAuth redirect)
- Logs success/failure but doesn't interrupt user flow

### Database

#### New Table: `webhook_health`
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
```

### Frontend Components

#### **WhatsAppConnection Component** (Enhanced)
- Shows connection status badge (Connected/Disconnected)
- Displays phone number and WABA ID
- **Webhook Status Section**:
  - ✓ Verified / ◌ Pending badge
  - Last webhook timestamp
- **Template Sync Section**:
  - Sync status (pending/syncing/success/error) with icon and color
  - Approved vs. total template count
  - Last sync timestamp
  - Error message display (if any)
  - Manual "Sync Templates Now" button
- Connect/Disconnect/Reconnect buttons
- Token expiry information
- Warning banner for expiring tokens

## Testing Checklist

### Unit Tests

- [ ] **Template Parsing**
  - [ ] Parse HEADER component correctly
  - [ ] Parse BODY component with placeholders
  - [ ] Parse FOOTER component
  - [ ] Parse BUTTONS (QUICK_REPLY, PHONE_NUMBER, URL)
  - [ ] Handle missing components gracefully

- [ ] **HMAC Verification**
  - [ ] Valid signature accepted
  - [ ] Invalid signature rejected
  - [ ] Missing signature rejected
  - [ ] Wrong algorithm rejected
  - [ ] Timing-safe comparison used (no timing attacks)

- [ ] **Webhook Health Service**
  - [ ] Initialize new health record
  - [ ] Update sync status
  - [ ] Retrieve health status
  - [ ] Error message persistence

### Integration Tests

- [ ] **OAuth → Auto-Sync Flow**
  - [ ] User completes OAuth
  - [ ] System automatically calls syncTemplatesForOrg()
  - [ ] Sync runs asynchronously (no delay in callback)
  - [ ] webhook_health table updated with sync status
  - [ ] User is redirected immediately (not blocked)

- [ ] **Manual Sync Endpoint**
  - [ ] POST /templates/sync triggers sync
  - [ ] Sync status changes to "syncing"
  - [ ] Only APPROVED templates stored
  - [ ] Sync status changes to "success" with count
  - [ ] Error status set if sync fails
  - [ ] Can call sync multiple times (idempotent)

- [ ] **Template Retrieval**
  - [ ] GET /templates returns only APPROVED templates
  - [ ] GET /templates/status shows correct counts
  - [ ] Component structure properly parsed

- [ ] **Webhook Verification**
  - [ ] Valid webhook processed (200 response)
  - [ ] Invalid signature returns 403
  - [ ] webhook_health.webhook_verified set to true
  - [ ] Events routed to correct handlers
  - [ ] Asynchronous processing (200 returned immediately)

- [ ] **Webhook Health Endpoints**
  - [ ] GET /webhook/health returns current status
  - [ ] GET /webhook/health/detailed includes template counts
  - [ ] Returns 404 if org not found
  - [ ] Returns 400 if org_id missing

### End-to-End Tests

1. **Complete OAuth + Template Sync Flow**
   - [ ] User clicks "Connect WhatsApp"
   - [ ] Redirected to Meta OAuth
   - [ ] User authorizes
   - [ ] Callback received and verified
   - [ ] Access token encrypted and stored
   - [ ] Auto-sync triggers
   - [ ] User sees "syncing" status in UI
   - [ ] Sync completes
   - [ ] User sees "success" status with template count

2. **Manual Template Sync**
   - [ ] User clicks "Sync Templates Now"
   - [ ] Status changes to "syncing"
   - [ ] Button disabled while syncing
   - [ ] Sync completes
   - [ ] Status shows "success"
   - [ ] Count shows approved/total
   - [ ] Last sync time updated

3. **Webhook Verification**
   - [ ] Meta sends webhook with valid signature
   - [ ] Signature verified (timing-safe)
   - [ ] webhook_verified = true in health
   - [ ] UI shows "✓ Verified" badge
   - [ ] last_webhook_timestamp updated

4. **Error Scenarios**
   - [ ] Network error during sync shows error status
   - [ ] Invalid template data handled gracefully
   - [ ] Webhook signature mismatch logs and rejects
   - [ ] Missing verification token returns 403
   - [ ] Database errors logged but don't crash

### Performance Tests

- [ ] Template sync completes in < 5 seconds
- [ ] Template retrieval (GET /templates) in < 500ms
- [ ] Webhook verification in < 100ms
- [ ] No database connection leaks
- [ ] Large template sets (100+) handled efficiently

### Security Tests

- [ ] HMAC-SHA256 signature verified before processing
- [ ] Timing-safe comparison prevents timing attacks
- [ ] Access tokens encrypted (AES-256-GCM)
- [ ] SQL injection attempts blocked
- [ ] Only APPROVED templates exposed
- [ ] Error messages don't leak sensitive info

### UI Tests

- [ ] WhatsAppConnection component renders
- [ ] Status badges display correctly
- [ ] Sync status colors correct (green=success, orange=syncing, red=error)
- [ ] Manual sync button works
- [ ] Template count displayed accurately
- [ ] Error messages display when sync fails
- [ ] No console errors or warnings
- [ ] Mobile responsive layout

## Test Data & Fixtures

### Meta API Mock Responses

```json
// GET /v19.0/{waba-id}/message_templates
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
          "text": "Thank you for your order #{{1}}. Expected delivery: {{2}}"
        },
        {
          "type": "BUTTONS",
          "buttons": [
            {
              "type": "QUICK_REPLY",
              "text": "Track Order"
            }
          ]
        }
      ]
    },
    {
      "id": "12346",
      "name": "pending_template",
      "status": "PENDING_REVIEW",
      "language": "en_US",
      "category": "TRANSACTIONAL",
      "components": [...]
    }
  ]
}
```

### Webhook Signature Test

```javascript
// Create valid webhook signature
const crypto = require('crypto');
const body = JSON.stringify({...});
const secret = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const signature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');
```

## Deployment Checklist

- [ ] Database migration applied (webhook_health table)
- [ ] Environment variables set:
  - [ ] `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - [ ] `DEBUG=false` (debug logging off in production)
- [ ] API service built and tested
- [ ] Desktop app built and tested
- [ ] WebSocket connections tested
- [ ] Error logs monitored
- [ ] Database backups enabled
- [ ] Rate limiting configured (if needed)

## Known Limitations & Future Work

### Phase 2 (Current)
- ✓ Template sync from Meta
- ✓ HMAC-SHA256 verification
- ✓ Health tracking
- ⏳ UI status indicators (in progress)

### Phase 3 (Next)
- [ ] Message event handling (incoming messages)
- [ ] Status event handling (delivery updates)
- [ ] Template event handling (status changes)
- [ ] Real-time conversation routing
- [ ] Message broadcast via WebSocket

### Phase 4 (Future)
- [ ] Webhook retry logic
- [ ] Template version management
- [ ] A/B testing with templates
- [ ] Template performance analytics

## Support & Troubleshooting

### Common Issues

**Sync Status Stuck on "Syncing"**
- Check database connection
- Verify Meta API key is valid
- Check network connectivity
- Review error_message in webhook_health table

**Webhook Not Verified**
- Verify webhook URL in Meta dashboard
- Check WHATSAPP_WEBHOOK_VERIFY_TOKEN matches
- Ensure POST endpoint returns 200 immediately
- Review webhook logs

**Templates Not Appearing**
- Confirm "Only APPROVED" filter is working
- Verify templates exist in Meta dashboard
- Check last_template_sync timestamp
- Review error_message field

### Debug Mode

Enable detailed logging:
```bash
DEBUG=true node dist/index.js
```

## Resources

- [Meta WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api/reference)
- [HMAC-SHA256 Verification](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/)

---

**Last Updated**: Phase 4.6  
**Next Phase**: Message & Status Event Handling (Phase 4.7)
