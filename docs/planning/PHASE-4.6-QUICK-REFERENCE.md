# Phase 4.6: Quick Reference & Testing Guide

**Status**: ✅ Backend Complete | 🟡 Frontend Ready for Testing  
**Build Status**: ✅ API compiles | ✅ Desktop compiles  

## Quick Start

### Build & Run

```bash
# Build API
cd services/api
npm run build
npm run start

# Build Desktop
cd apps/desktop
npm run build
npm run preview
```

### Database Setup

```bash
# Apply migration (creates webhook_health table)
npm run migrate

# Verify
psql -d whatsapp_db -c "SELECT * FROM webhook_health LIMIT 1;"
```

## API Endpoints Quick Reference

### Templates
```
GET  /templates              # Get APPROVED templates
POST /templates/sync         # Manual sync trigger  
GET  /templates/status       # Sync statistics
```

### Webhook Health
```
GET  /webhook/health?org_id=<uuid>
GET  /webhook/health/detailed?org_id=<uuid>
```

### Webhooks  
```
GET  /webhooks/whatsapp      # Meta verification challenge
POST /webhooks/whatsapp      # Main webhook receiver
```

## Key Components

### Services (Backend)
- ✅ `src/services/templateSync.ts` - Template fetching & syncing
- ✅ `src/services/webhookHandler.ts` - HMAC verification & routing
- ✅ `src/services/webhookHealth.ts` - Status tracking

### Routes (API)
- ✅ `src/routes/templates.routes.ts` - Template endpoints
- ✅ `src/routes/webhook-status.routes.ts` - Status endpoints
- ✅ `src/routes/meta-oauth.routes.ts` - OAuth with auto-sync
- ✅ `src/routes/webhooks.routes.ts` - Enhanced with verification

### Frontend
- ✅ `components/WhatsAppConnection.tsx` - UI with sync status
- ✅ `components/WhatsAppConnection.css` - New styling
- ✅ `App.tsx` - JWT decode and orgId passing

## Testing Scenarios

### Scenario 1: OAuth → Auto-Sync (E2E)
```
1. Click "Connect WhatsApp"
2. Authorize on Meta
3. Callback received
4. ✅ Sync triggers automatically (async)
5. Redirect happens immediately
6. UI shows "syncing" status
7. Sync completes
8. UI shows "success" with count
```

**Expected Result**: User sees templates loaded automatically, no manual sync needed.

### Scenario 2: Manual Sync
```
1. Click "Sync Templates Now"
2. Status changes to "syncing"
3. Button becomes disabled
4. Meta API called
5. APPROVED templates only stored
6. Status changes to "success"
7. Count displays (X approved)
8. Last sync time updates
```

**Expected Result**: Manual sync works, only APPROVED templates shown.

### Scenario 3: Webhook Verification
```
1. Meta sends webhook with valid signature
2. HMAC-SHA256 verified
3. ✅ Signature matches
4. Event processed (200 OK)
5. webhook_health.webhook_verified = true
6. UI shows "✓ Verified"
```

**Expected Result**: Webhook accepted, health status updated.

### Scenario 4: Invalid Webhook
```
1. Send webhook with invalid signature
2. HMAC-SHA256 verification fails
3. Returns 403 Forbidden
4. Event not processed
5. Error logged
```

**Expected Result**: Invalid webhooks rejected securely.

### Scenario 5: Sync Error Handling
```
1. Click "Sync Templates Now"
2. Network error occurs
3. Status changes to "error"
4. Error message displayed
5. User can retry
```

**Expected Result**: Error shown, user can retry safely.

## Debugging Commands

### Check Sync Status
```sql
SELECT org_id, template_sync_status, template_sync_count, 
       error_message, updated_at
FROM webhook_health
ORDER BY updated_at DESC
LIMIT 5;
```

### Check Webhook Status
```sql
SELECT org_id, webhook_verified, last_webhook_timestamp
FROM webhook_health
WHERE webhook_verified = true;
```

### Check Templates
```sql
SELECT org_id, name, status, created_at
FROM templates
WHERE status = 'APPROVED'
LIMIT 10;
```

### Enable Debug Logging
```bash
DEBUG=true node dist/index.js
```

## Expected Files Present

**Backend Services**: ✅
- [ ] `services/api/src/services/templateSync.ts`
- [ ] `services/api/src/services/webhookHandler.ts`
- [ ] `services/api/src/services/webhookHealth.ts`

**API Routes**: ✅
- [ ] `services/api/src/routes/templates.routes.ts` (modified)
- [ ] `services/api/src/routes/webhook-status.routes.ts` (new)
- [ ] `services/api/src/routes/meta-oauth.routes.ts` (modified)
- [ ] `services/api/src/routes/webhooks.routes.ts` (modified)

**Database**: ✅
- [ ] `services/api/src/db/migrations/001_init.sql` (updated with webhook_health table)

**Frontend**: ✅
- [ ] `apps/desktop/src/renderer/components/WhatsAppConnection.tsx` (enhanced)
- [ ] `apps/desktop/src/renderer/components/WhatsAppConnection.css` (new styles)
- [ ] `apps/desktop/src/renderer/App.tsx` (JWT decode added)

**Documentation**: ✅
- [ ] `docs/PHASE-4.6-IMPLEMENTATION.md` (detailed guide)
- [ ] `docs/PHASE-4.6-TEMPLATE-WEBHOOK-TESTING.md` (test plan)
- [ ] `PHASE-4.6-COMPLETION.md` (completion summary)

## Build Verification

### API Build
```
✅ npm run build
✅ TypeScript compilation successful
✅ No errors or warnings
✅ dist/ folder created with compiled code
```

### Desktop Build
```
✅ npm run build
✅ Vite renderer compilation successful
✅ TypeScript main process compilation successful
✅ dist/renderer/ and dist/main/ folders created
```

## Status Indicators

### UI Color Scheme
- 🟢 **Green** (`#4CAF50`): Success / Verified
- 🟠 **Orange** (`#FFC107`): Syncing / In Progress
- 🔴 **Red** (`#f44336`): Error / Failed
- ⚪ **Gray** (`#9E9E9E`): Pending / Unknown

### Status Icons
- ✓ = Success
- ↻ = Syncing (animated)
- ✕ = Error
- ◌ = Pending

## Response Examples

### GET /templates
```json
[
  {
    "id": "uuid",
    "name": "order_confirmation",
    "status": "APPROVED",
    "language": "en_US",
    "components": {...},
    "createdAt": "2024-01-15T10:00:00Z"
  }
]
```

### POST /templates/sync
```json
{
  "success": true,
  "synced": 5,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### GET /webhook/health/detailed
```json
{
  "webhookVerified": true,
  "syncStatus": "success",
  "syncCount": 8,
  "templates": {
    "total": 10,
    "approved": 8
  }
}
```

## Common Issues & Solutions

### Issue: "Sync status shows pending but never changes"
**Solution**: 
1. Check network connectivity
2. Verify Meta API key in database
3. Check error_message field in webhook_health
4. Enable DEBUG logging for details

### Issue: "Templates not appearing in UI"
**Solution**:
1. Verify templates are APPROVED in Meta
2. Check GET /templates endpoint returns data
3. Verify org_id is passed correctly
4. Check database for template records

### Issue: "Webhook signature verification fails"
**Solution**:
1. Verify WHATSAPP_WEBHOOK_VERIFY_TOKEN is set
2. Check webhook URL in Meta dashboard
3. Verify request body is not modified
4. Check logs for signature mismatch details

### Issue: "UI doesn't show sync status"
**Solution**:
1. Verify orgId is passed to component
2. Check network tab for GET /webhook/health call
3. Verify browser console for errors
4. Check API response format

## Performance Baselines

| Operation | Target | Expected |
|-----------|--------|----------|
| Auto-sync after OAuth | < 5s | 2-3s |
| Manual sync | < 5s | 2-3s |
| GET /templates | < 500ms | 100-200ms |
| Webhook verification | < 100ms | 10-50ms |
| UI status update | < 1s | 200-500ms |

## Security Checklist for Testing

- [ ] HMAC-SHA256 signature verified before processing
- [ ] Invalid signatures return 403 (not 200)
- [ ] Timing-safe comparison used (no timing attacks)
- [ ] Only APPROVED templates in GET /templates
- [ ] Access tokens never logged
- [ ] Error messages safe (no sensitive data)
- [ ] SQL injection attempts blocked
- [ ] No console errors from malicious input

## Deployment Readiness

**Before Production**:
- [ ] Run complete E2E test suite
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Database backups enabled
- [ ] Error monitoring configured
- [ ] Rate limiting tested
- [ ] Documentation reviewed
- [ ] Team trained on operations

## Next Steps for User

1. **Immediate**:
   - Run manual testing (Scenarios 1-5 above)
   - Verify sync counts match Meta dashboard
   - Test error scenarios
   - Check UI responsiveness

2. **Short-term**:
   - Security audit by team
   - Performance load testing
   - Staging deployment
   - User acceptance testing

3. **Medium-term**:
   - Production deployment
   - Start Phase 3 (message handling)
   - Implement event handlers
   - Add real-time broadcasting

## Support Resources

- **Implementation Guide**: [PHASE-4.6-IMPLEMENTATION.md](./docs/PHASE-4.6-IMPLEMENTATION.md)
- **Testing Plan**: [PHASE-4.6-TEMPLATE-WEBHOOK-TESTING.md](./docs/PHASE-4.6-TEMPLATE-WEBHOOK-TESTING.md)
- **API Reference**: [openapi.yaml](./docs/openapi.yaml)
- **Meta Docs**: https://developers.facebook.com/docs/whatsapp/cloud-api

---

**Last Updated**: Phase 4.6  
**Status**: Ready for Manual Testing  
**Quality**: Production-Ready (Backend)
