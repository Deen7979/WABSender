# 📋 Production Deployment Checklist - Subscription License System

**Project**: WABSender Subscription License System  
**Target Deployment**: TBD (After approval)  
**Last Updated**: February 22, 2026

---

## Pre-Deployment Phase (Week 1)

### 1. Environment Setup

- [ ] **Server Infrastructure**
  - [ ] Staging server provisioned
  - [ ] Production server provisioned
  - [ ] Database servers configured (staging & production)
  - [ ] Load balancer configured (if applicable)

- [ ] **Dependencies Installation**
  ```bash
  # API Server
  cd services/api
  npm install pg jsonwebtoken
  
  # Desktop App
  cd apps/desktop
  npm install node-machine-id
  ```

- [ ] **Environment Variables**
  ```bash
  # Generate secure secrets
  JWT_SECRET=<64-character-random-string>
  JWT_REFRESH_SECRET=<64-character-random-string>
  LICENSE_ENCRYPTION_KEY=<32-character-random-string>
  
  # Configuration
  HEARTBEAT_INTERVAL_HOURS=24
  OFFLINE_GRACE_PERIOD_DAYS=3
  LICENSE_KEY_PREFIX=WAB
  
  # Database
  DATABASE_URL=postgresql://user:pass@host:port/dbname
  ```

### 2. Database Migration (Staging)

- [ ] **Pre-Migration**
  - [ ] Create staging database from production snapshot
  - [ ] Backup staging database
  - [ ] Document database size and row counts

- [ ] **Execute Migration**
  ```bash
  psql -d wabsender_staging -f services/api/src/db/migrations/004_subscription_license_system.sql
  ```

- [ ] **Post-Migration Validation**
  ```sql
  -- Verify tables
  SELECT COUNT(*) FROM license_plans;  -- Should return 3
  SELECT COUNT(*) FROM license_audit logs;
  SELECT COUNT(*) FROM license_refresh_tokens;
  SELECT COUNT(*) FROM license_metrics;
  SELECT COUNT(*) FROM device_fingerprints;
  
  -- Verify indexes
  \di license*
  
  -- Verify triggers
  SELECT * FROM information_schema.triggers WHERE trigger_name LIKE 'update_license_%';
  
  -- Verify views
  SELECT * FROM v_active_subscriptions LIMIT 5;
  SELECT * FROM v_license_analytics;
  ```

- [ ] **Performance Check**
  ```sql
  EXPLAIN ANALYZE SELECT * FROM licenses WHERE license_key_hash = '<hash>';
  EXPLAIN ANALYZE SELECT * FROM license_activations WHERE device_id = '<id>';
  ```

### 3. API Deployment (Staging)

- [ ] **Build API**
  ```bash
  cd services/api
  npm run build
  npm run test  # Run unit tests
  ```

- [ ] **Register Routes**
  - [ ] Edit `services/api/src/index.ts`
  - [ ] Add: `import { subscriptionLicenseRouter } from "./routes/subscription-license.routes.js";`
  - [ ] Add: `app.use("/subscription", subscriptionLicenseRouter);`

- [ ] **Schedule Background Jobs**
  - [ ] Token cleanup (daily at 3 AM)
  - [ ] License expiry check (daily at 2 AM)
  - [ ] Metrics aggregation (weekly)

- [ ] **Deploy to Staging**
  ```bash
  pm2 restart api-staging
  # OR
  systemctl restart wabsender-api-staging
  ```

- [ ] **Smoke Test**
  ```bash
  curl http://staging-api.wabsender.com/subscription/plans
  # Should return 3 plans
  ```

### 4. Desktop App Deployment (Staging)

- [ ] **Integrate License Service**
  - [ ] Edit `apps/desktop/src/main/index.ts`
  - [ ] Add imports from `licenseService.ts`
  - [ ] Initialize heartbeat scheduler
  - [ ] Add license validation on startup

- [ ] **Expose IPC Methods**
  - [ ] Edit `apps/desktop/src/main/preload.ts`
  - [ ] Add `getDeviceId()` and `getLicenseData()` methods

- [ ] **Integrate UI Component**
  - [ ] Edit `apps/desktop/src/renderer/components/PlatformDashboard.tsx`
  - [ ] Import `SubscriptionLicenseManagement`
  - [ ] Add to navigation

- [ ] **Build Desktop App**
  ```bash
  cd apps/desktop
  npm run build
  npm run dist  # Create installer
  ```

- [ ] **Publish to Staging Channel**
  - [ ] Upload to staging auto-update server
  - [ ] Test auto-update mechanism

### 5. Functional Testing (Staging)

- [ ] **Scenario 1: Issue New License**
  - [ ] Login as super admin
  - [ ] Navigate to Licenses tab
  - [ ] Click "Issue New License"
  - [ ] Select org, plan, seats
  - [ ] Verify key generated (format: `WAB-XXXXX-XXXXX-XXXXX-XXXXX`)
  - [ ] Copy key and verify warning message

- [ ] **Scenario 2: Activate Desktop Client**
  - [ ] Install staging desktop app
  - [ ] Enter license key
  - [ ] Verify activation success
  - [ ] Check device appears in admin panel

- [ ] **Scenario 3: Daily Heartbeat**
  - [ ] Wait 24 hours OR manually trigger
  - [ ] Verify heartbeat timestamp updates
  - [ ] Verify license status remains active

- [ ] **Scenario 4: Offline Grace Period**
  - [ ] Disconnect internet
  - [ ] Use app for 3 days
  - [ ] On day 4, verify app locks
  - [ ] Reconnect and verify app unlocks

- [ ] **Scenario 5: License Renewal**
  - [ ] In admin panel, click "Renew"
  - [ ] Verify expiry date extended by 365 days
  - [ ] Verify audit log created
  - [ ] Verify desktop app receives update on next heartbeat

- [ ] **Scenario 6: Instant Revocation**
  - [ ] In admin panel, click "Revoke"
  - [ ] Enter reason
  - [ ] Verify status changes to "revoked"
  - [ ] Wait for next heartbeat (or force)
  - [ ] Verify desktop app locks

- [ ] **Scenario 7: Seat Limit Enforcement**
  - [ ] Create license with 3 seats (Pro plan)
  - [ ] Activate 3 devices
  - [ ] Attempt to activate 4th device
  - [ ] Verify "Seat limit reached" error

- [ ] **Scenario 8: Expired License Behavior**
  - [ ] Create license expiring in 1 day
  - [ ] Wait for automated expiry job
  - [ ] Verify status changes to "expired"
  - [ ] Verify desktop app locks

### 6. Load Testing (Staging)

- [ ] **Heartbeat Endpoint Load**
  ```bash
  # Using k6 or Apache JMeter
  # Target: 1,000 requests/second
  # Expected: <200ms p95 response time
  # Failure rate: <0.1%
  ```

- [ ] **Activation Endpoint Load**
  ```bash
  # Target: 100 concurrent activations
  # Expected: <500ms p95 response time
  ```

- [ ] **Database Query Performance**
  ```sql
  -- License lookup should be <50ms
  EXPLAIN ANALYZE SELECT * FROM licenses WHERE id = '<uuid>';
  
  -- Activation insert should be <100ms
  EXPLAIN ANALYZE INSERT INTO license_activations (...) VALUES (...);
  ```

- [ ] **Token Refresh Load**
  ```bash
  # Target: 500 requests/second
  # Expected: <150ms response time
  ```

### 7. Security Testing (Staging)

- [ ] **SQL Injection Attempts**
  - [ ] Try injecting SQL in license key field
  - [ ] Try injecting SQL in device ID field
  - [ ] Verify all parameterized queries

- [ ] **Authentication Bypass Attempts**
  - [ ] Try accessing /subscription endpoints without token
  - [ ] Try accessing super admin endpoints with regular user
  - [ ] Verify middleware protection

- [ ] **Invalid License Key Attempts**
  - [ ] Try activating with random string
  - [ ] Try activating with expired key
  - [ ] Try activating with revoked key
  - [ ] Verify proper error messages

- [ ] **Token Manipulation**
  - [ ] Try using expired JWT
  - [ ] Try using JWT with invalid signature
  - [ ] Try using refresh token after revocation
  - [ ] Verify all fail gracefully

- [ ] **Device Spoofing**
  - [ ] Try reusing device ID on different machine
  - [ ] Try changing device ID mid-session
  - [ ] Verify fingerprint validation

### 8. Monitoring Setup

- [ ] **Application Monitoring**
  - [ ] Set up APM (New Relic, Datadog, etc.)
  - [ ] Configure error tracking (Sentry, Rollbar)
  - [ ] Set up log aggregation (ELK, Splunk)

- [ ] **Database Monitoring**
  - [ ] Configure pg_stat_statements
  - [ ] Set up slow query logging
  - [ ] Configure connection pool monitoring

- [ ] **Metrics Dashboard**
  - [ ] Active licenses count
  - [ ] Licenses expiring in 30 days
  - [ ] Heartbeat success rate (target >99%)
  - [ ] Activation success rate (target >98%)
  - [ ] Devices with stale heartbeat (>3 days)
  - [ ] API response times (p50, p95, p99)

- [ ] **Alerts Configuration**
  - [ ] Heartbeat failure rate > 5%
  - [ ] Activation failure rate > 2%
  - [ ] API error rate > 1%
  - [ ] Database connection pool exhaustion
  - [ ] Disk space < 20%

### 9. Customer Communications

- [ ] **T-30 Days Email**
  ```
  Subject: Important Update: WABSender License System Upgrade

  Dear valued customer,

  We're upgrading our licensing system to provide better features...
  [See MIGRATION-STRATEGY-SUBSCRIPTION-LICENSE.md for template]
  ```

- [ ] **T-14 Days Email**
  - [ ] Detailed migration timeline
  - [ ] What to expect
  - [ ] FAQ section

- [ ] **T-7 Days Email**
  - [ ] Final reminder
  - [ ] Support contact information

### 10. Support Team Training

- [ ] **Training Materials**
  - [ ] How subscription licenses work
  - [ ] How to issue/renew/revoke licenses
  - [ ] Common troubleshooting scenarios
  - [ ] Escalation procedures

- [ ] **Training Session**
  - [ ] Live demo of admin panel
  - [ ] Walkthrough of test scenarios
  - [ ] Q&A session

- [ ] **Documentation**
  - [ ] Internal wiki updated
  - [ ] Support runbook created
  - [ ] FAQ document prepared

---

## Production Deployment Phase (Week 2)

### 1. Final Pre-Deployment Checks

- [ ] All staging tests passed
- [ ] Load testing results acceptable
- [ ] Security audit completed
- [ ] Monitoring dashboards operational
- [ ] Support team trained
- [ ] Customer communications sent (T-7 days)
- [ ] Rollback procedure documented and tested
- [ ] Backup strategy confirmed

### 2. Maintenance Window

**Scheduled Date**: _____________  
**Duration**: 2 hours  
**Time**: Low-traffic period (e.g., 2 AM - 4 AM)

### 3. Database Migration (Production)

- [ ] **30 Minutes Before**
  - [ ] Send final notification to active users
  - [ ] Put API in maintenance mode
  - [ ] Stop background jobs

- [ ] **Migration Execution**
  ```bash
  # 1. Backup
  pg_dump wabsender_production > backup_$(date +%Y%m%d_%H%M%S).sql
  
  # 2. Verify backup
  ls -lh backup_*.sql
  
  # 3. Run migration
  psql -d wabsender_production -f services/api/src/db/migrations/004_subscription_license_system.sql
  
  # 4. Verify
  psql -d wabsender_production -c "SELECT COUNT(*) FROM license_plans;"
  ```

- [ ] **Validation**
  - [ ] All tables created
  - [ ] Default data inserted
  - [ ] Indexes present
  - [ ] Triggers working
  - [ ] Views accessible

### 4. API Deployment (Production)

- [ ] Build production bundle
  ```bash
  cd services/api
  NODE_ENV=production npm run build
  ```

- [ ] Deploy to production
  ```bash
  pm2 restart api-production
  # OR
  systemctl restart wabsender-api
  ```

- [ ] Smoke test
  ```bash
  curl https://api.wabsender.com/subscription/plans
  # Should return 3 plans
  ```

- [ ] Monitor logs
  ```bash
  pm2 logs api-production
  # Watch for errors
  ```

### 5. Desktop App Deployment (Production)

- [ ] Build production installer
  ```bash
  cd apps/desktop
  npm run dist
  ```

- [ ] Code sign installer (Windows)
  ```bash
  signtool sign /f certificate.pfx /p password /tr http://timestamp.digicert.com WABSender-Setup-1.2.0.exe
  ```

- [ ] Upload to auto-update server
  - [ ] Upload installer
  - [ ] Update latest.yml / latest-mac.yml
  - [ ] Verify download links

- [ ] Staged rollout
  - [ ] Release to 10% of users first
  - [ ] Monitor for 2 hours
  - [ ] If stable, release to 50%
  - [ ] Monitor for 2 hours
  - [ ] Release to 100%

### 6. Post-Deployment Validation (First 2 Hours)

- [ ] **API Health Check**
  - [ ] All endpoints responding
  - [ ] Response times within SLA
  - [ ] Error rate < 1%

- [ ] **Database Health Check**
  - [ ] Connection pool healthy
  - [ ] Query performance acceptable
  - [ ] No locks or deadlocks

- [ ] **Desktop App Health Check**
  - [ ] Auto-updates distributing
  - [ ] Activations succeeding
  - [ ] Heartbeats processing
  - [ ] No crash reports

- [ ] **User Testing**
  - [ ] Test license issuance
  - [ ] Test activation
  - [ ] Test heartbeat
  - [ ] Test renewal
  - [ ] Test revocation

### 7. Remove Maintenance Mode

- [ ] Verify all systems operational
- [ ] Remove maintenance page
- [ ] Restart background jobs
- [ ] Send "System restored" notification

---

## Post-Deployment Phase (Week 3-4)

### Day 1

- [ ] Monitor all metrics every hour
- [ ] Review error logs
- [ ] Check customer support tickets
- [ ] Address any critical issues immediately

### Day 2-7

- [ ] Daily metrics review
- [ ] Daily support ticket review
- [ ] Monitor activation success rate
- [ ] Monitor heartbeat success rate
- [ ] Check for stale devices

### Week 2

- [ ] Weekly metrics report
- [ ] Customer feedback survey
- [ ] Support team debrief
- [ ] Identify any issues

### Week 3

- [ ] Performance optimization (if needed)
- [ ] Fix any bugs discovered
- [ ] Update documentation

### Week 4

- [ ] Retrospective meeting
- [ ] Document lessons learned
- [ ] Plan deprecation of legacy system (if applicable)
- [ ] Final report to stakeholders

---

## Rollback Procedure (If Needed)

### Trigger Conditions

- Database migration fails
- API error rate > 10%
- Activation failure rate > 20%
- Critical bug discovered

### Rollback Steps

1. **Immediate**
   - [ ] Put system in maintenance mode
   - [ ] Stop API servers
   - [ ] Stop background jobs

2. **Database Rollback**
   ```bash
   # Drop new tables
   psql -d wabsender_production -c "DROP TABLE IF EXISTS license_plans CASCADE;"
   psql -d wabsender_production -c "DROP TABLE IF EXISTS license_audit_logs CASCADE;"
   # ... (drop all new tables)
   
   # OR restore full backup
   psql -d wabsender_production < backup_YYYYMMDD_HHMMSS.sql
   ```

3. **API Rollback**
   ```bash
   git checkout <previous-commit>
   npm run build
   pm2 restart api-production
   ```

4. **Desktop App Rollback**
   - [ ] Update latest.yml to point to previous version
   - [ ] Force update notification to all users

5. **Communications**
   - [ ] Send email to customers: "Technical issues, system reverted"
   - [ ] Update status page
   - [ ] Schedule post-mortem

---

## Success Criteria

- ✅ All functional tests passed
- ✅ Load tests within performance targets
- ✅ Security tests passed
- ✅ Zero data loss during migration  
- ✅ Activation success rate >98%
- ✅ Heartbeat success rate >99%
- ✅ API response time p95 <200ms
- ✅ Zero critical bugs in first week
- ✅ Customer satisfaction maintained

---

## Sign-Off

**Project Manager**: _________________  Date: __________

**Lead Developer**: _________________  Date: __________

**QA Lead**: _________________  Date: __________

**System Administrator**: _________________  Date: __________

**Approved for Deployment**: ☐ YES  ☐ NO

---

**Next Steps After Approval**:
1. Schedule production deployment date
2. Send T-30 customer notification
3. Begin staging deployment
