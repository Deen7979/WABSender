# 🚀 Subscription License System - Integration Guide

## Overview

This guide provides step-by-step instructions for integrating the new subscription-based license system into WABSender.

---

## 📦 What's Been Created

### Database Layer:
- ✅ `004_subscription_license_system.sql` - Complete database migration
- ✅ 7 new tables (plans, audit logs, tokens, metrics, fingerprints)
- ✅ Enhanced existing tables with subscription fields
- ✅ Triggers and functions for automation
- ✅ Views for reporting

### Backend Services:
- ✅ `licenseKeyGenerator.ts` - Secure key generation with checksums
- ✅ `licenseTokenService.ts` - JWT token management
- ✅ `subscription-license.routes.ts` - Complete REST API

### Desktop Client:
- ✅ `licenseService.ts` - Electron main process validation
- ✅ Device fingerprinting
- ✅ Encrypted local storage
- ✅ Heartbeat scheduler

### Frontend:
- ✅ `SubscriptionLicenseManagement.tsx` - Redesigned admin panel
- ✅ `SubscriptionLicenseManagement.css` - Modern styling
- ✅ `subscriptionLicenseAPI.ts` - API client helpers

### Documentation:
- ✅ Migration strategy document
- ✅ Implementation timeline & risk matrix
- ✅ This integration guide

---

## 🔧 Step 1: Database Setup

### 1.1 Run the Migration

```bash
# Connect to your PostgreSQL database
psql -U your_user -d wabsender

# Run the migration
\i services/api/src/db/migrations/004_subscription_license_system.sql

# Verify tables were created
\dt license*
\dt device_fingerprints

# Check default plans were inserted
SELECT * FROM license_plans;
```

### 1.2 Verify Migration

```sql
-- Should return 3 plans
SELECT COUNT(*) FROM license_plans;

-- Existing licenses should be linked to plans
SELECT 
  l.id, 
  l.plan_code, 
  lp.name AS plan_name
FROM licenses l
LEFT JOIN license_plans lp ON lp.id = l.plan_id
LIMIT 5;
```

---

## 🔧 Step 2: Backend Integration

### 2.1 Register New Routes

Edit `services/api/src/index.ts` or `services/api/src/server.ts`:

```typescript
import { subscriptionLicenseRouter } from "./routes/subscription-license.routes.js";

// ... existing imports ...

// Register routes
app.use("/subscription", subscriptionLicenseRouter);

// Keep legacy routes for backward compatibility
app.use("/license", licenseRouter); // Existing route
```

### 2.2 Add Environment Variables

Edit `.env` file:

```bash
# License System Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-token-secret
LICENSE_ENCRYPTION_KEY=your-encryption-key-for-desktop-storage

# Optional: Configure heartbeat and expiry
HEARTBEAT_INTERVAL_HOURS=24
OFFLINE_GRACE_PERIOD_DAYS=3
LICENSE_KEY_PREFIX=WAB
```

### 2.3 Add Scheduled Jobs

Edit `services/api/src/index.ts`:

```typescript
import { cleanupExpiredTokens } from "./services/licenseTokenService.js";

// Schedule token cleanup (daily at 3 AM)
setInterval(async () => {
  const deletedCount = await cleanupExpiredTokens();
  console.log(`Cleaned up ${deletedCount} expired tokens`);
}, 24 * 60 * 60 * 1000);

// Schedule license expiry check (daily at 2 AM)
setInterval(async () => {
  await db.query("SELECT check_license_expiry()");
}, 24 * 60 * 60 * 1000);
```

### 2.4 Build and Restart

```bash
cd services/api
npm run build
pm2 restart api

# Or for development
npm run dev
```

---

## 🔧 Step 3: Desktop Client Integration

### 3.1 Install Dependencies

```bash
cd apps/desktop
npm install node-machine-id
```

### 3.2 Integrate License Service in Main Process

Edit `apps/desktop/src/main/index.ts`:

```typescript
import {
  generateDeviceId,
  validateLicenseOnStartup,
  initializeHeartbeatScheduler,
  loadLicenseData,
  getLicenseLockScreen
} from "./licenseService.js";

// Generate device ID on app start
const deviceId = generateDeviceId();

// Validate license on startup
app.on("ready", async () => {
  const validation = await validateLicenseOnStartup(
    API_BASE_URL,
    getAccessToken() // Your existing auth token
  );

  if (!validation.valid) {
    // Show license lock screen
    const lockScreen = getLicenseLockScreen(validation.reason || "unknown");
    mainWindow.loadHTML(lockScreen);
    return;
  }

  // Initialize heartbeat
  const heartbeatInterval = initializeHeartbeatScheduler(
    API_BASE_URL,
    async () => getAccessToken(),
    (reason) => {
      // Handle heartbeat failure
      console.error("Heartbeat failed:", reason);
      if (reason === "revoked" || reason === "expired") {
        // Lock the application
        const lockScreen = getLicenseLockScreen(reason);
        mainWindow.loadHTML(lockScreen);
      }
    }
  );

  // Load main application
  mainWindow.loadFile("index.html");
});
```

### 3.3 Expose Device ID to Renderer

Edit `apps/desktop/src/main/preload.ts`:

```typescript
contextBridge.exposeInMainWorld("electron", {
  // ... existing methods ...
  
  getDeviceId: () => ipcRenderer.invoke("get-device-id"),
  getLicenseData: () => ipcRenderer.invoke("get-license-data"),
});

// In main process
ipcMain.handle("get-device-id", () => {
  return generateDeviceId();
});

ipcMain.handle("get-license-data", async () => {
  return await loadLicenseData();
});
```

### 3.4 Build Desktop App

```bash
cd apps/desktop
npm run build
npm run dist  # Creates installer
```

---

## 🔧 Step 4: Frontend Integration

### 4.1 Update API Client

Edit `apps/desktop/src/renderer/services/apiClient.ts`:

```typescript
import { subscriptionLicenseAPI } from "./subscriptionLicenseAPI.js";

export const apiClient = {
  // ... existing methods ...
  
  // Add subscription license methods
  getSubscriptionPlans: () => 
    subscriptionLicenseAPI.getSubscriptionPlans(API_BASE_URL, getToken()),
    
  getSubscriptionLicenses: (filters?: any) => 
    subscriptionLicenseAPI.getSubscriptionLicenses(API_BASE_URL, getToken(), filters),
    
  getSubscriptionLicenseDetails: (id: string) => 
    subscriptionLicenseAPI.getSubscriptionLicenseDetails(API_BASE_URL, getToken(), id),
    
  issueSubscriptionLicense: (data: any) => 
    subscriptionLicenseAPI.issueSubscriptionLicense(API_BASE_URL, getToken(), data),
    
  renewSubscriptionLicense: (id: string, days?: number) => 
    subscriptionLicenseAPI.renewSubscriptionLicense(API_BASE_URL, getToken(), id, days),
    
  revokeSubscriptionLicense: (id: string, data?: any) => 
    subscriptionLicenseAPI.revokeSubscriptionLicense(API_BASE_URL, getToken(), id, data),
};
```

### 4.2 Update Platform Dashboard

Edit `apps/desktop/src/renderer/components/PlatformDashboard.tsx`:

```tsx
import { SubscriptionLicenseManagement } from "./SubscriptionLicenseManagement";

// Replace or add alongside existing LicenseManagement
export const PlatformDashboard = ({ apiClient, onEnterOrg }) => {
  const [view, setView] = useState<'dashboard' | 'licenses' | 'users'>('dashboard');
  
  return (
    <div>
      {/* ... navigation ... */}
      
      {view === 'licenses' && (
        <SubscriptionLicenseManagement apiClient={apiClient} />
      )}
    </div>
  );
};
```

### 4.3 Build Frontend

```bash
cd apps/desktop
npm run build
```

---

## 🔧 Step 5: Testing

### 5.1 Unit Tests

```bash
# Backend tests
cd services/api
npm test

# Desktop tests
cd apps/desktop
npm test
```

### 5.2 Manual Testing Checklist

#### Super Admin Tests:
- [ ] Can view all license plans
- [ ] Can issue new subscription license
- [ ] License key is shown once
- [ ] Can view license details
- [ ] Can see device activations
- [ ] Can renew license (extends expiry by 1 year)
- [ ] Can revoke license
- [ ] Device list shows heartbeat status

#### Desktop Client Tests:
- [ ] Activation with valid key works
- [ ] Activation with invalid key fails gracefully
- [ ] Device ID is generated consistently
- [ ] License data is encrypted on disk
- [ ] Heartbeat runs every 24 hours
- [ ] Offline grace period works (3 days)
- [ ] App locks when license expires
- [ ] App locks when license is revoked
- [ ] Renewed license unlocks app on next heartbeat

#### API Tests:
- [ ] POST /subscription/plans creates plan
- [ ] GET /subscription/plans lists plans
- [ ] POST /subscription/instances issues license
- [ ] GET /subscription/instances lists licenses
- [ ] GET /subscription/instances/:id shows details
- [ ] PUT /subscription/instances/:id/renew extends expiry
- [ ] PUT /subscription/instances/:id/revoke changes status
- [ ] POST /subscription/activate activates device
- [ ] POST /subscription/heartbeat validates device
- [ ] POST /subscription/validate checks activation

---

## 🔧 Step 6: Migration from Legacy System

### 6.1 Identify Legacy Licenses

```sql
SELECT 
  id,
  plan_code,
  expires_at,
  issued_to_org_id,
  status
FROM licenses
WHERE plan_id IS NULL
  AND status = 'active';
```

### 6.2 Migrate Legacy Licenses

```sql
-- Option 1: Assign to appropriate plan
UPDATE licenses l
SET plan_id = (
  CASE 
    WHEN l.max_devices = 1 THEN (SELECT id FROM license_plans WHERE code = 'basic')
    WHEN l.max_devices <= 3 THEN (SELECT id FROM license_plans WHERE code = 'pro')
    ELSE (SELECT id FROM license_plans WHERE code = 'enterprise')
  END
)
WHERE plan_id IS NULL;

-- Option 2: Set expiry for perpetual licenses (grandfather 1 year)
UPDATE licenses
SET expires_at = NOW() + INTERVAL '365 days',
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{grandfathered}',
      'true'::jsonb
    )
WHERE expires_at IS NULL
  AND status = 'active';
```

### 6.3 Notify Customers

Send email using template in migration strategy document.

---

## 🔧 Step 7: Monitoring & Maintenance

### 7.1 Set Up Monitoring

Create a monitoring dashboard with these metrics:

```sql
-- Active licenses
SELECT COUNT(*) FROM licenses WHERE status = 'active';

-- Licenses expiring in 30 days
SELECT COUNT(*) FROM licenses 
WHERE status = 'active' 
  AND expires_at < NOW() + INTERVAL '30 days';

-- Devices with recent heartbeat (last 24h)
SELECT COUNT(*) FROM license_activations 
WHERE deactivated_at IS NULL 
  AND last_heartbeat > NOW() - INTERVAL' 24 hours';

-- Devices with stale heartbeat (>3 days)
SELECT COUNT(*) FROM license_activations 
WHERE deactivated_at IS NULL 
  AND last_heartbeat < NOW() - INTERVAL '3 days';
```

### 7.2 Set Up Alerts

Configure alerts for:
- Heartbeat failure rate > 5%
- Activation failure rate > 2%
- License expiring in < 7 days
- Unusual device activation patterns

### 7.3 Regular Maintenance

Schedule these jobs:

```bash
# Daily: Clean up expired tokens
0 3 * * * curl -X POST http://localhost:3000/admin/cleanup-expired-tokens

# Daily: Check and update expired licenses
0 2 * * * psql -d wabsender -c "SELECT check_license_expiry();"

# Weekly: Generate license usage report
0 9 * * 1 psql -d wabsender -f /path/to/weekly-report.sql > report.txt
```

---

## 🚨 Troubleshooting

### Issue: License activation fails

**Check:**
1. Is license key valid? `SELECT validateLicenseKey('WAB-...')`
2. Is license status active? `SELECT status FROM licenses WHERE license_key_hash = '...'`
3. Are seats available? `SELECT seats_used, seats_total FROM licenses WHERE id = '...'`
4. Is license expired? `SELECT expires_at FROM licenses WHERE id = '...'`

### Issue: Heartbeat fails

**Check:**
1. Is device activated? `SELECT * FROM license_activations WHERE device_id = '...'`
2. Is license still active? Check license status
3. Are refresh tokens valid? Check `license_refresh_tokens` table
4. Network connectivity from desktop client

### Issue: Desktop app locks unexpectedly

**Check:**
1. License expiry date
2. Last heartbeat timestamp
3. Offline grace period (default 3 days)
4. License revocation status

---

## 📊 Performance Optimization

### Database Indexes

Already created by migration, but verify:

```sql
-- Check indexes
\di license*

-- Add additional indexes if needed
CREATE INDEX IF NOT EXISTS idx_license_activations_heartbeat_recent 
  ON license_activations(last_heartbeat DESC) 
  WHERE deactivated_at IS NULL 
    AND last_heartbeat > NOW() - INTERVAL '7 days';
```

### API Caching

Add caching for frequently accessed data:

```typescript
// Cache license plans (they change rarely)
const planCache = new Map();
const PLAN_CACHE_TTL = 300000; // 5 minutes

subscriptionLicenseRouter.get("/plans", async (req, res) => {
  if (planCache.has('plans')) {
    return res.json(planCache.get('plans'));
  }
  
  const result = await db.query("SELECT * FROM license_plans WHERE is_active = true");
  const data = { plans: result.rows };
  planCache.set('plans', data);
  setTimeout(() => planCache.delete('plans'), PLAN_CACHE_TTL);
  
  return res.json(data);
});
```

---

## 🎉 Deployment Checklist

### Pre-Deployment:
- [ ] Database migration tested on staging
- [ ] API endpoints tested on staging
- [ ] Desktop client tested on staging
- [ ] Backward compatibility verified
- [ ] Rollback procedure documented
- [ ] Customer communication prepared
- [ ] Support team trained
- [ ] Monitoring dashboards ready
- [ ] Alerts configured

### Deployment:
- [ ] Database backup created
- [ ] Run database migration
- [ ] Deploy API updates
- [ ] Publish desktop client update
- [ ] Deploy frontend updates
- [ ] Smoke tests passed
- [ ] Send customer communications
- [ ] Monitor for 24 hours

### Post-Deployment:
- [ ] All metrics green
- [ ] No unexpected errors
- [ ] Customer feedback reviewed
- [ ] Support ticket volume normal
- [ ] Post-mortem meeting scheduled

---

## 📞 Support

For issues during implementation:

- **Technical Issues**: Create issue in GitHub repo
- **Questions**: Slack #subscription-license-project
- **Urgent**: Page on-call engineer

---

## 📚 Additional Resources

- [Migration Strategy Document](./MIGRATION-STRATEGY-SUBSCRIPTION-LICENSE.md)
- [Implementation Timeline](./IMPLEMENTATION-TIMELINE-RISK-MATRIX.md)
- [API Documentation](../api/openapi.yaml) - Update with new endpoints
- [Database Schema](../database/db-schema.sql)

---

**Last Updated**: 2026-02-22  
**Version**: 1.0.0  
**Status**: Ready for Implementation ✅
