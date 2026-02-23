# 🔄 Migration Strategy: Perpetual → Subscription License System

## Executive Summary

This document outlines the complete migration strategy from the current perpetual license model to a subscription-based license system for WABSender. The migration is designed to be **zero-downtime** and **backward-compatible** during the transition period.

---

## 📊 Current State Analysis

### Existing System
- **License Model**: Perpetual with optional expiry
- **Tables**: `licenses`, `license_activations`
- **Key Storage**: SHA256 hashed license keys
- **Activation**: Basic device binding with seat limits
- **Validation**: Manual admin-triggered validation
- **Expiry**: Optional `expires_at` field (NULL = perpetual)

### Affected Components
1. Database schema (2 tables)
2. API endpoints (8 routes)
3. Super admin panel UI
4. Desktop client activation flow
5. License validation logic

---

## 🎯 Migration Goals

1. **Zero Downtime**: No service interruption
2. **Backward Compatibility**: Existing licenses continue working
3. **Data Preservation**: All current activations remain valid
4. **Graceful Cutover**: Phased transition with rollback capability
5. **User Communication**: Clear notifications about changes

---

## 📅 Migration Phases

### Phase 1: Database Schema Extension (Week 1)

#### Actions:
1. Run migration `004_subscription_license_system.sql`
2. Add new tables:
   - `license_plans`
   - `license_audit_logs`
   - `license_refresh_tokens`
   - `license_metrics`
   - `device_fingerprints`
3. Add new columns to `licenses` table
4. Add new columns to `license_activations` table
5. Create indexes and triggers
6. Populate default license plans

#### Backward Compatibility:
- **Existing licenses work unchanged**
- NULL `plan_id` = legacy perpetual license
- NULL `expires_at` = perpetual (maintained)
- Seats logic defaults to current behavior

#### Validation:
```sql
-- Verify migration success
SELECT COUNT(*) FROM license_plans; -- Should be 3 (Basic, Pro, Enterprise)
SELECT COUNT(*) FROM licenses WHERE plan_id IS NULL; -- Legacy licenses
SELECT COUNT(*) FROM license_activations; -- Should match pre-migration count
```

#### Rollback Plan:
```sql
-- If issues arise, columns can be dropped without affecting core functionality
ALTER TABLE licenses DROP COLUMN IF EXISTS plan_id CASCADE;
DROP TABLE IF EXISTS license_plans CASCADE;
-- Continue with other tables...
```

---

### Phase 2: API Deployment (Week 2)

#### Actions:
1. Deploy new API routes alongside existing ones:
   - `/subscription/*` (new routes)
   - Keep `/license/*` (legacy routes) for backward compatibility
2. Update license key generator with checksum validation
3. Deploy token management service
4. Update super admin endpoints to support both models

#### Backward Compatibility Strategy:
```typescript
// Legacy endpoint continues working
POST /license/activate 
  → Works with both perpetual and subscription licenses
  
// New endpoint for subscription features
POST /subscription/activate
  → Enhanced with token management
  
// Adapter pattern in code
if (license.plan_id) {
  // Subscription logic
} else {
  // Legacy perpetual logic
}
```

#### Testing Checklist:
- [ ] Legacy license activation works
- [ ] New subscription activation works
- [ ] Heartbeat endpoint responds correctly
- [ ] Token refresh works
- [ ] License renewal works
- [ ] License revocation works
- [ ] Audit logging captures all events

---

### Phase 3: Desktop Client Update (Week 3)

#### Actions:
1. Add license validation service to Electron main process
2. Implement device fingerprinting
3. Add encrypted license storage
4. Implement heartbeat scheduler
5. Add grace period for offline usage
6. Update activation UI

#### Deployment Strategy:
- **Auto-update enabled** (existing feature)
- Desktop clients update automatically
- No manual intervention required
- Old clients continue working with legacy endpoints

#### Backward Compatibility:
- Desktop v1.2.x → Uses legacy `/license/activate`
- Desktop v1.3.0+ → Uses new `/subscription/activate`
- Server supports both concurrently

#### Grace Period:
- 3-day offline grace period
- Soft warnings at 1 day, 2 days
- Hard lock after 3 days without heartbeat

---

### Phase 4: Super Admin Panel Redesign (Week 4)

#### Actions:
1. Update license management UI
2. Add subscription controls (renew, revoke)
3. Add device management view
4. Add audit log viewer
5. Add license analytics dashboard
6. Add plan management interface

#### UI Changes:

**Before:**
```
License ID: abc-123
Status: active
Plan: perpetual
Devices: 1 / 3
```

**After:**
```
License ID: abc-123
Status: active (Subscription)
Plan: Professional
Expires: 22-02-2027
Devices: 1 / 3
Last Seen: 21-02-2026 14:30
[Renew] [Revoke] [View Devices] [Audit Log]
```

#### Feature Flags:
```typescript
// Toggle between old and new UI
const ENABLE_SUBSCRIPTION_UI = process.env.ENABLE_SUBSCRIPTION_UI === 'true';
```

---

### Phase 5: Data Migration (Week 5)

#### Actions:
1. Convert existing perpetual licenses to subscription model
2. Set `plan_id` for all licenses
3. Calculate `expires_at` for perpetual licenses (1 year from now)
4. Send notifications to customers about transition
5. Update documentation

#### Migration Script:
```sql
-- Step 1: Assign default plan to perpetual licenses
UPDATE licenses 
SET plan_id = (SELECT id FROM license_plans WHERE code = 'pro')
WHERE plan_id IS NULL AND plan_code = 'perpetual';

-- Step 2: Set expiry date (1 year from now for grandfathered customers)
UPDATE licenses
SET expires_at = NOW() + INTERVAL '365 days',
    renewed_at = NOW()
WHERE expires_at IS NULL AND status = 'active';

-- Step 3: Mark as grandfathered in metadata
UPDATE licenses
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{grandfathered}',
  'true'::jsonb
)
WHERE expires_at IS NULL;

-- Step 4: Update seats_used
UPDATE licenses l
SET seats_used = (
  SELECT COUNT(*)::int 
  FROM license_activations la 
  WHERE la.license_id = l.id AND la.deactivated_at IS NULL
);
```

#### Customer Communication:
```
Subject: WABSender License Model Update

Dear Valued Customer,

We're upgrading our licensing system to provide better service and features.

WHAT'S CHANGING:
- Your perpetual license is being converted to a yearly subscription
- You'll receive 1 year FREE as a thank you for being an early customer
- After that, renewal will be $299/year

NEW FEATURES:
- Real-time license validation
- Better device management
- Priority support
- Automatic updates

NO ACTION REQUIRED:
- Your existing devices will continue working
- Renewal reminders will be sent 30 days before expiry

Questions? Contact support@wabsender.com
```

---

### Phase 6: Monitoring & Optimization (Week 6)

#### Actions:
1. Monitor heartbeat success rates
2. Track activation failures
3. Monitor API performance
4. Analyze audit logs
5. Optimize database queries
6. Tune heartbeat frequency if needed

#### Metrics to Track:
- Heartbeat success rate (target: >95%)
- Activation success rate (target: >98%)
- API response time (target: <200ms p95)
- Device reconnection rate after offline period
- License renewal rate
- Support ticket volume

#### Alerts:
```yaml
alerts:
  - name: heartbeat_failure_rate_high
    condition: heartbeat_failures > 5% in 1 hour
    notify: engineering@wabsender.com
    
  - name: activation_failure_spike
    condition: activation_failures > 10 in 10 minutes
    notify: engineering@wabsender.com
    
  - name: license_expiring_soon
    condition: licenses_expiring < 30 days
    notify: billing@wabsender.com
```

---

## 🔐 Data Integrity Safeguards

### 1. Atomic Migrations
```bash
# Use transactions for all schema changes
BEGIN;
-- Migration steps
COMMIT; -- Only if all steps succeed
```

### 2. Backup Strategy
```bash
# Before migration
pg_dump wabsender > backup_pre_license_migration_$(date +%Y%m%d).sql

# After migration
pg_dump wabsender > backup_post_license_migration_$(date +%Y%m%d).sql
```

### 3. Constraint Validation
```sql
-- Ensure data integrity after migration
SELECT COUNT(*) FROM licenses WHERE plan_id IS NULL; -- Should be 0 after Phase 5
SELECT COUNT(*) FROM licenses WHERE seats_used > seats_total; -- Should be 0
SELECT COUNT(*) FROM license_activations WHERE license_id NOT IN (SELECT id FROM licenses); -- Should be 0
```

---

## 👥 Team Responsibilities

### Database Admin:
- Run migration scripts
- Monitor database performance
- Create backups
- Verify data integrity

### Backend Engineer:
- Deploy new API endpoints
- Test backward compatibility
- Monitor API logs
- Handle error cases

### Frontend Engineer:
- Update super admin panel UI
- Test license management flows
- Handle loading states
- Implement feature flags

### Desktop Engineer:
- Update Electron client
- Test activation flows
- Implement heartbeat
- Test offline behavior

### Product/Support:
- Prepare customer communications
- Update documentation
- Train support team
- Monitor feedback

---

## 🧪 Testing Strategy

### Unit Tests:
```typescript
describe('License Key Generator', () => {
  test('generates valid key with checksum', () => {
    const key = generateLicenseKey();
    expect(validateLicenseKey(key.key)).toEqual({ valid: true });
  });
});

describe('Subscription API', () => {
  test('activates license within seat limit', async () => {
    const response = await request(app)
      .post('/subscription/activate')
      .send({ licenseKey, deviceId })
      .expect(200);
    expect(response.body.activated).toBe(true);
  });
});
```

### Integration Tests:
```typescript
describe('License Lifecycle', () => {
  test('complete subscription flow', async () => {
    // 1. Super admin issues license
    const { licenseKey } = await issueLicense({ orgId, planCode: 'pro' });
    
    // 2. User activates desktop
    const activation = await activateLicense(licenseKey, deviceId);
    expect(activation.activated).toBe(true);
    
    // 3. Heartbeat succeeds
    const heartbeat = await sendHeartbeat(deviceId);
    expect(heartbeat.valid).toBe(true);
    
    // 4. Admin renews license
    await renewLicense(activation.licenseId);
    
    // 5. Heartbeat still succeeds
    const heartbeat2 = await sendHeartbeat(deviceId);
    expect(heartbeat2.valid).toBe(true);
    
    // 6. Admin revokes license
    await revokeLicense(activation.licenseId);
    
    // 7. Heartbeat fails
    const heartbeat3 = await sendHeartbeat(deviceId);
    expect(heartbeat3.valid).toBe(false);
  });
});
```

### Load Tests:
```bash
# Test concurrent activations
artillery run load-test-activation.yml

# Test heartbeat load (1000 devices checking in)
artillery run load-test-heartbeat.yml
```

---

## 🚨 Rollback Procedures

### Rollback from Phase 2 (API):
```bash
# Revert to previous API version
git checkout v1.2.3
npm run build
pm2 restart api

# Database remains compatible
```

### Rollback from Phase 3 (Desktop):
```bash
# Desktop auto-update can rollback
# Publish previous version with higher priority
npm run publish -- --version 1.2.3 --force
```

### Rollback from Phase 5 (Data Migration):
```sql
-- Restore from backup
psql wabsender < backup_pre_license_migration_20260222.sql

-- Or revert specific changes
UPDATE licenses SET plan_id = NULL WHERE metadata->>'grandfathered' = 'true';
UPDATE licenses SET expires_at = NULL WHERE metadata->>'grandfathered' = 'true';
```

---

## 📈 Success Criteria

### Technical Metrics:
- ✅ 100% of existing licenses continue working
- ✅ <1% activation failure rate
- ✅ API p95 latency <200ms
- ✅ Zero data loss
- ✅ Zero downtime during migration

### Business Metrics:
- ✅ <5% customer support ticket increase
- ✅ >90% customer satisfaction with transition
- ✅ >95% license renewal rate (grandfathered customers)
- ✅ Clear audit trail for all operations

### Operational Metrics:
- ✅ All monitoring alerts configured
- ✅ Team trained on new system
- ✅ Documentation updated
- ✅ Rollback procedures tested

---

## 📚 Post-Migration Cleanup

### After 90 Days:
1. Remove feature flags for old UI
2. Deprecate legacy `/license/*` endpoints
3. Remove compatibility shims
4. Archive old license data
5. Optimize database with new schema only

### After 180 Days:
1. Remove legacy endpoint support entirely
2. Mandate desktop client v1.3.0+
3. Clean up grandfathered license logic
4. Full subscription-only mode

---

## 📞 Support & Escalation

### During Migration:
- **Slack Channel**: #license-migration
- **On-call Engineer**: Pager Duty rotation
- **Escalation Path**: Engineer → Tech Lead → CTO
- **Customer Support**: support@wabsender.com
- **Status Page**: status.wabsender.com

---

## ✅ Pre-Migration Checklist

- [ ] Database backup created
- [ ] Migration script tested on staging
- [ ] API endpoints deployed to staging
- [ ] Desktop client tested on staging
- [ ] Super admin panel tested on staging
- [ ] End-to-end tests passing
- [ ] Load tests passing
- [ ] Customer communication drafted
- [ ] Support team trained
- [ ] Rollback procedures documented
- [ ] Monitoring alerts configured
- [ ] Stakeholders notified

---

## 🎉 Go-Live Checklist

- [ ] Final database backup
- [ ] Run Phase 1 migration
- [ ] Deploy Phase 2 API updates
- [ ] Publish Phase 3 desktop client
- [ ] Deploy Phase 4 UI updates
- [ ] Execute Phase 5 data migration
- [ ] Send customer communications
- [ ] Monitor metrics for 24 hours
- [ ] Validate success criteria
- [ ] Document lessons learned

---

**Migration Owner**: CTO / Engineering Lead  
**Last Updated**: 2026-02-22  
**Status**: Ready for Review & Approval
