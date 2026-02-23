# 🚀 Subscription License System - Quick Start Checklist

## Before You Begin

- [ ] Review [SUBSCRIPTION-LICENSE-COMPLETE-SUMMARY.md](./SUBSCRIPTION-LICENSE-COMPLETE-SUMMARY.md)
- [ ] Read [SUBSCRIPTION-LICENSE-INTEGRATION-GUIDE.md](./SUBSCRIPTION-LICENSE-INTEGRATION-GUIDE.md)
- [ ] Backup production database

---

## Option 1: Automated Setup ⚡ (Recommended)

```powershell
# Run from project root
.\scripts\setup-subscription-license.ps1

# Follow on-screen instructions
```

This script will:
- ✅ Check prerequisites
- ✅ Install dependencies
- ✅ Configure environment variables
- ✅ Run database migration (with backup)
- ✅ Build API and desktop app
- ✅ Show next steps

**Time Required**: 5-10 minutes

---

## Option 2: Manual Setup 🛠️

### Step 1: Dependencies (5 min)
- [ ] `cd apps\desktop && npm install node-machine-id`

### Step 2: Environment Configuration (5 min)
- [ ] Create `services\api\.env` if not exists
- [ ] Add these variables:
  ```env
  JWT_SECRET=<generate-secure-secret>
  JWT_REFRESH_SECRET=<generate-another-secret>
  LICENSE_ENCRYPTION_KEY=<32-character-random-string>
  HEARTBEAT_INTERVAL_HOURS=24
  OFFLINE_GRACE_PERIOD_DAYS=3
  LICENSE_KEY_PREFIX=WAB
  ```

### Step 3: Database Migration (10 min)
```powershell
# Backup first!
pg_dump -U your_user wabsender > backup.sql

# Run migration
psql -U your_user -d wabsender -f services\api\src\db\migrations\004_subscription_license_system.sql

# Verify
psql -U your_user -d wabsender -c "SELECT COUNT(*) FROM license_plans;"
# Should return 3
```

### Step 4: Build Backend (5 min)
```powershell
cd services\api
npm run build
```

### Step 5: Build Desktop (5 min)
```powershell
cd apps\desktop
npm run build
```

**Total Time**: ~30 minutes

---

## Integration Steps (Required After Setup)

### 1. Register API Routes (2 min)

**File**: `services/api/src/index.ts`

```typescript
// Add import at top
import { subscriptionLicenseRouter } from "./routes/subscription-license.routes.js";

// Add route registration (around line 30-40)
app.use("/subscription", subscriptionLicenseRouter);
```

**Verify**: Rebuild API with `npm run build`

---

### 2. Integrate Desktop License Service (10 min)

**File**: `apps/desktop/src/main/index.ts`

```typescript
// Add imports
import {
  generateDeviceId,
  validateLicenseOnStartup,
  initializeHeartbeatScheduler,
  getLicenseLockScreen
} from "./licenseService.js";

// Add to app.on("ready") event
app.on("ready", async () => {
  const deviceId = generateDeviceId();
  
  const validation = await validateLicenseOnStartup(
    process.env.API_URL || "https://api.wabsender.com",
    getAccessToken() // Your existing auth token getter
  );

  if (!validation.valid) {
    const lockScreen = getLicenseLockScreen(validation.reason || "unknown");
    mainWindow.loadHTML(lockScreen);
    return;
  }

  // Initialize heartbeat
  const heartbeatInterval = initializeHeartbeatScheduler(
    process.env.API_URL || "https://api.wabsender.com",
    async () => getAccessToken(),
    (reason) => {
      if (reason === "revoked" || reason === "expired") {
        mainWindow.loadHTML(getLicenseLockScreen(reason));
      }
    }
  );

  // Continue with normal app loading
  createWindow();
});
```

**Verify**: Rebuild desktop with `npm run build`

---

### 3. Integrate Admin UI Component (5 min)

**File**: `apps/desktop/src/renderer/components/PlatformDashboard.tsx`

```typescript
// Add import
import { SubscriptionLicenseManagement } from "./SubscriptionLicenseManagement";

// Replace or add to navigation
export const PlatformDashboard = ({ apiClient, onEnterOrg }) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  
  return (
    <div>
      <nav>
        <button onClick={() => setActiveTab("licenses")}>Licenses</button>
        {/* ... other nav buttons ... */}
      </nav>
      
      {activeTab === "licenses" && (
        <SubscriptionLicenseManagement apiClient={apiClient} />
      )}
      
      {/* ... other tabs ... */}
    </div>
  );
};
```

**Verify**: Check component renders without errors

---

### 4. Expose Device ID to Renderer (5 min)

**File**: `apps/desktop/src/main/preload.ts`

```typescript
import { ipcRenderer, contextBridge } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // ... existing methods ...
  
  getDeviceId: () => ipcRenderer.invoke("get-device-id"),
  getLicenseData: () => ipcRenderer.invoke("get-license-data"),
});
```

**File**: `apps/desktop/src/main/index.ts`

```typescript
import { ipcMain } from "electron";
import { generateDeviceId, loadLicenseData } from "./licenseService.js";

ipcMain.handle("get-device-id", () => {
  return generateDeviceId();
});

ipcMain.handle("get-license-data", async () => {
  return await loadLicenseData();
});
```

---

## Testing Checklist ✅

### Smoke Tests (15 min)

#### API Tests
- [ ] Start API: `cd services\api && npm run dev`
- [ ] Test endpoint: `curl http://localhost:3000/subscription/plans`
- [ ] Should return 3 plans (Basic, Professional, Enterprise)

#### Database Tests
- [ ] Connect: `psql -d wabsender`
- [ ] Check tables: `\dt license*`
- [ ] Check plans: `SELECT * FROM license_plans;`
- [ ] Should see 3 rows

#### Desktop Tests
- [ ] Start desktop: `cd apps\desktop && npm run dev`
- [ ] Check console for errors
- [ ] Verify app starts without crashes

### Full Integration Test (30 min)

- [ ] **Issue License**:
  - Open admin panel → Licenses tab
  - Click "Issue New License"
  - Select org, plan, seats
  - Copy generated key (format: `WAB-XXXXX-XXXXX-XXXXX-XXXXX`)

- [ ] **Activate Device**:
  - Desktop app → Enter license key
  - Click "Activate"
  - Should show "Activation successful"
  - Should show device in admin panel

- [ ] **Send Heartbeat**:
  - Wait 24 hours OR manually trigger
  - Check admin panel → device list
  - Last heartbeat should update
  - Indicator should be green (●)

- [ ] **Renew License**:
  - Admin panel → click "Renew" on license
  - Expiry date should extend by 1 year
  - Audit log should show "renewed" event

- [ ] **Revoke License**:
  - Admin panel → click "Revoke"
  - Enter reason: "Testing revocation"
  - License status should change to "revoked"
  - Desktop app should lock on next heartbeat

- [ ] **Test Offline Grace Period**:
  - Disconnect internet
  - Desktop app should work for 3 days
  - After 3 days, should show lock screen

---

## Production Deployment Checklist 🚢

### Pre-Deployment (1-2 days before)
- [ ] Test on staging environment
- [ ] Backup production database: `pg_dump wabsender > prod_backup_$(date +%Y%m%d).sql`
- [ ] Generate production secrets (JWT, encryption keys)
- [ ] Update environment variables on production server
- [ ] Schedule maintenance window (recommend 2-4 hours, low-traffic time)
- [ ] Notify customers T-48h: "System upgrade scheduled"

### Deployment Day
- [ ] Put application in maintenance mode
- [ ] Run database migration (5-10 minutes)
- [ ] Verify migration: `psql -d wabsender -c "SELECT COUNT(*) FROM license_plans;"`
- [ ] Deploy API updates (restart services)
- [ ] Smoke test API endpoints
- [ ] Publish desktop app update (auto-update will distribute)
- [ ] Remove maintenance mode
- [ ] Monitor for 2 hours (check error rates, response times)

### Post-Deployment (24 hours)
- [ ] Monitor heartbeat success rate (target >99%)
- [ ] Monitor activation success rate (target >98%)
- [ ] Review customer support tickets
- [ ] Check database performance (query times <100ms)
- [ ] Send follow-up email: "Upgrade complete, new features available"

### Week 1 Monitoring
- [ ] Daily: Check license expiry warnings
- [ ] Daily: Check stale heartbeats (>3 days)
- [ ] Track customer adoption (how many using new UI?)
- [ ] Collect feedback from support team
- [ ] Schedule retrospective meeting

---

## Rollback Procedure 🔙

If critical issues occur:

### 1. Database Rollback (5 min)
```powershell
# Stop API
pm2 stop api

# Restore backup
psql -d wabsender < prod_backup_YYYYMMDD.sql

# Verify restore
psql -d wabsender -c "\dt license*"
```

### 2. API Rollback (5 min)
```powershell
# Revert to previous commit
git checkout <previous-commit>

# Rebuild
cd services\api
npm run build

# Restart
pm2 start api
```

### 3. Desktop App Rollback (10 min)
- Publish previous version through auto-update
- Notify customers to restart app

### 4. Communications
- [ ] Send email: "We're experiencing technical issues, rolling back update"
- [ ] Update status page
- [ ] Post-mortem analysis

---

## Support Resources 📚

### Documentation
- [Complete Implementation Summary](./SUBSCRIPTION-LICENSE-COMPLETE-SUMMARY.md)
- [Integration Guide](./SUBSCRIPTION-LICENSE-INTEGRATION-GUIDE.md)
- [Migration Strategy](./MIGRATION-STRATEGY-SUBSCRIPTION-LICENSE.md)
- [Timeline & Risk Matrix](./IMPLEMENTATION-TIMELINE-RISK-MATRIX.md)

### Quick Reference
- **License Key Format**: `WAB-XXXXX-XXXXX-XXXXX-XXXXX`
- **API Base Path**: `/subscription`
- **Heartbeat Interval**: 24 hours
- **Offline Grace Period**: 3 days
- **Token Expiry**: Access (24h), Refresh (7d)
- **Encryption**: AES-256-CBC

### Common Commands
```powershell
# Start services
pm2 start api                  # API server
npm run dev                    # Desktop app (dev mode)

# Database
psql -d wabsender              # Connect to DB
\dt license*                   # List license tables
SELECT * FROM v_active_subscriptions;  # View active licenses

# Logs
pm2 logs api                   # API logs
Get-Content -Path "C:\ProgramData\WABSender\logs\*" -Wait  # Desktop logs
```

---

## Estimated Timeline

| Phase | Time | Status |
|-------|------|--------|
| Automated Setup | 10 min | ⏳ Pending |
| API Integration | 5 min | ⏳ Pending |
| Desktop Integration | 15 min | ⏳ Pending |
| UI Integration | 5 min | ⏳ Pending |
| Smoke Tests | 15 min | ⏳ Pending |
| Integration Tests | 30 min | ⏳ Pending |
| **Total** | **~1.5 hours** | |

---

## Success Criteria ✨

You'll know the system is working when:

- ✅ API endpoint returns license plans
- ✅ Admin panel displays licenses with status badges
- ✅ Desktop app activates with license key
- ✅ Heartbeat runs every 24 hours
- ✅ Renewal extends expiry by 1 year
- ✅ Revocation locks desktop app
- ✅ Audit logs capture all events
- ✅ Database queries complete in <100ms
- ✅ No errors in console/logs

---

## Need Help?

- **Setup Issues**: Review [Integration Guide](./SUBSCRIPTION-LICENSE-INTEGRATION-GUIDE.md)
- **Testing Failures**: Check [Complete Summary](./SUBSCRIPTION-LICENSE-COMPLETE-SUMMARY.md) troubleshooting section
- **Database Issues**: Review [Migration Strategy](./MIGRATION-STRATEGY-SUBSCRIPTION-LICENSE.md)

---

**Version**: 1.0  
**Last Updated**: 2026-02-22  
**Status**: Ready to Execute ✅
