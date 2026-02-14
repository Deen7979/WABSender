# Phase 4 Plan: Reports, Packaging & Installers

**Status:** 📋 **AWAITING APPROVAL** (Plan for review)  
**Planning Date:** February 2, 2026  
**Estimated Duration:** 16 working days  
**Prerequisite:** Phase 3 (Inbox + Automation) — ✅ Complete and Approved  

---

## 📋 Executive Summary

Phase 4 is the **final production readiness phase** that transforms the fully-functional WhatsApp messaging system into a **distributable, compliant, enterprise-ready desktop application**.

This phase focuses on:
1. **Reporting & Analytics** — Campaign performance metrics, inbox analytics, CSV export
2. **Audit & Compliance** — Comprehensive audit logs for regulatory compliance
3. **Desktop Packaging** — Windows (.exe) and macOS (.dmg) installers
4. **Auto-Update Mechanism** — Seamless version updates for deployed apps
5. **Final QA & Release Checklist** — Production readiness validation

**End Goal:** Signed, distributable installers ready for customer deployment with full reporting and compliance capabilities.

---

## 🎯 Phase 4 Objectives

### Business Goals
- ✅ Provide actionable insights into campaign performance (delivery funnel, engagement metrics)
- ✅ Enable data export for customer analysis and archival
- ✅ Ensure compliance with industry regulations (audit trails, opt-in tracking)
- ✅ Deliver professional, signed installers for Windows and macOS
- ✅ Enable seamless updates without user intervention

### Technical Goals
- ✅ Reporting API with aggregation queries (campaigns, inbox, contacts)
- ✅ CSV export for all major entities (messages, campaigns, contacts, audit logs)
- ✅ Audit log system capturing all user actions
- ✅ Electron Builder configuration for Windows/macOS
- ✅ Auto-update integration (electron-updater)
- ✅ Code signing for both platforms
- ✅ Final security audit and compliance validation

---

## 📦 Phase 4 Deliverables Overview

| Deliverable | Type | Priority | Estimated Days |
|-------------|------|----------|---------------|
| **Campaign Reports API** | Backend | High | 2 |
| **Inbox Analytics API** | Backend | High | 1.5 |
| **CSV Export Engine** | Backend | High | 1.5 |
| **Audit Log System** | Backend | Critical | 2 |
| **Desktop Reporting UI** | Frontend | High | 2 |
| **Windows Installer** | DevOps | Critical | 2 |
| **macOS Installer** | DevOps | Critical | 2 |
| **Auto-Update System** | DevOps | High | 2 |
| **Final QA & Release** | QA | Critical | 3 |

**Total:** 16 working days

---

## 🗂️ Phase 4 Milestone Breakdown

### **Milestone 4.1: Campaign & Inbox Reporting** (4.5 days)

**Goal:** Provide comprehensive analytics for campaigns and inbox activity with CSV export capability.

#### 4.1.1 Campaign Reports API (2 days)

**Endpoints:**

1. **GET /reports/campaigns/:campaignId**
   - Campaign summary (name, status, scheduled_at, total_recipients)
   - Delivery funnel: queued → sent → delivered → read → failed
   - Performance metrics: delivery rate %, read rate %, avg delivery time
   - Timeline graph data (hourly/daily message volume)

2. **GET /reports/campaigns**
   - List all campaigns with aggregated stats
   - Filters: date range, status, template
   - Sorting: by created_at, delivery_rate, read_rate
   - Pagination (50 per page)

3. **POST /reports/campaigns/export**
   - CSV export with columns:
     - Campaign Name, Template, Scheduled At, Status
     - Total Recipients, Sent, Delivered, Read, Failed
     - Delivery Rate %, Read Rate %, Created At
   - Returns downloadable CSV file

**Database Queries:**
```sql
-- Delivery funnel aggregation
SELECT 
  c.id AS campaign_id,
  c.name,
  COUNT(cr.id) AS total_recipients,
  SUM(CASE WHEN m.status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) AS sent_count,
  SUM(CASE WHEN m.status IN ('delivered', 'read') THEN 1 ELSE 0 END) AS delivered_count,
  SUM(CASE WHEN m.status = 'read' THEN 1 ELSE 0 END) AS read_count,
  SUM(CASE WHEN m.status = 'failed' THEN 1 ELSE 0 END) AS failed_count
FROM campaigns c
JOIN campaign_recipients cr ON c.id = cr.campaign_id
LEFT JOIN messages m ON cr.id = m.campaign_recipient_id
WHERE c.org_id = $1
GROUP BY c.id, c.name;
```

**Acceptance Criteria:**
- ✅ Campaign detail report shows accurate delivery funnel
- ✅ CSV export generates within 5 seconds for campaigns up to 10,000 recipients
- ✅ All percentages calculated correctly (delivery rate, read rate)
- ✅ Timeline data formatted for chart rendering

---

#### 4.1.2 Inbox Analytics API (1.5 days)

**Endpoints:**

1. **GET /reports/inbox/summary**
   - Total conversations (by status: active, archived)
   - Total messages (inbound/outbound)
   - Avg response time (time between inbound message and first agent reply)
   - Unread message count
   - Active conversations (received message in last 24h)
   - Date range filter

2. **GET /reports/inbox/agents**
   - Per-agent statistics:
     - Messages sent
     - Conversations handled
     - Avg response time
   - Leaderboard sorting

3. **POST /reports/inbox/export**
   - CSV columns:
     - Contact Name, Phone, Last Message At, Messages Sent, Messages Received
     - Unread Count, First Contact Date, Status

**Database Queries:**
```sql
-- Inbox summary
SELECT 
  COUNT(DISTINCT c.id) AS total_conversations,
  SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_count,
  COUNT(DISTINCT CASE WHEN m.direction = 'inbound' THEN m.id END) AS inbound_messages,
  COUNT(DISTINCT CASE WHEN m.direction = 'outbound' THEN m.id END) AS outbound_messages,
  AVG(EXTRACT(EPOCH FROM (reply.created_at - m.created_at))) AS avg_response_seconds
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
LEFT JOIN LATERAL (
  SELECT created_at FROM messages 
  WHERE conversation_id = c.id AND direction = 'outbound' 
  ORDER BY created_at ASC LIMIT 1
) reply ON true
WHERE c.org_id = $1
  AND c.created_at BETWEEN $2 AND $3;
```

**Acceptance Criteria:**
- ✅ Inbox summary accurate (matches live conversation counts)
- ✅ Response time calculation excludes automated replies
- ✅ Agent statistics correct (messages sent per agent)
- ✅ CSV export includes all conversations

---

#### 4.1.3 CSV Export Engine (1.5 days)

**Utility Module:** `services/api/src/utils/csvExporter.ts`

**Features:**
- Generic CSV generator (accepts column definitions + data rows)
- Handles escaping (commas, quotes, newlines)
- Streams large datasets (>10k rows) to avoid memory overflow
- Adds UTF-8 BOM for Excel compatibility
- Returns file stream with correct headers (`Content-Type: text/csv`)

**Usage Example:**
```typescript
import { generateCSV } from './utils/csvExporter';

const columns = [
  { header: 'Campaign Name', accessor: 'name' },
  { header: 'Delivery Rate', accessor: 'deliveryRate', formatter: (v) => `${v}%` }
];

const stream = await generateCSV(columns, campaignData);
res.setHeader('Content-Type', 'text/csv; charset=utf-8');
res.setHeader('Content-Disposition', 'attachment; filename=campaigns.csv');
stream.pipe(res);
```

**Acceptance Criteria:**
- ✅ CSV files open correctly in Excel and Google Sheets
- ✅ Special characters (commas, quotes) handled
- ✅ Exports up to 50,000 rows without timeout
- ✅ UTF-8 encoding preserved

---

### **Milestone 4.2: Audit Logs & Compliance** (2 days)

**Goal:** Comprehensive audit trail for all user actions to support compliance requirements (GDPR, HIPAA, SOC 2).

#### 4.2.1 Audit Log System (1.5 days)

**Database Schema:** (Already exists in 001_init.sql)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,          -- e.g., 'campaign.created', 'message.sent'
  resource_type TEXT,             -- e.g., 'campaign', 'contact'
  resource_id UUID,               -- ID of affected resource
  metadata JSONB,                 -- Additional context (IP, user agent, etc.)
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_timestamp ON audit_logs(org_id, timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
```

**Middleware:** `services/api/src/middleware/auditLog.ts`
- Auto-capture: user_id, org_id, action, timestamp, IP address, user agent
- Attached to all write operations (POST, PUT, DELETE)

**Actions to Log:**
- `auth.login`, `auth.logout`
- `campaign.created`, `campaign.started`, `campaign.paused`, `campaign.deleted`
- `contact.imported`, `contact.updated`, `contact.deleted`
- `message.sent`, `message.received`
- `template.synced`, `template.deleted`
- `automation.created`, `automation.updated`, `automation.triggered`
- `business_hours.updated`
- `export.generated` (CSV exports)

**Endpoints:**

1. **GET /audit-logs**
   - Query params: date range, user_id, action, resource_type
   - Pagination (100 per page)
   - Sorting by timestamp DESC

2. **POST /audit-logs/export**
   - CSV columns: Timestamp, User, Action, Resource Type, Resource ID, Metadata

**Acceptance Criteria:**
- ✅ All write operations logged automatically
- ✅ Audit log entries immutable (no UPDATE/DELETE)
- ✅ CSV export includes full audit trail
- ✅ Metadata captures IP address and user agent
- ✅ Retention policy support (e.g., delete logs older than 2 years)

---

#### 4.2.2 Audit Log Viewer UI (0.5 days)

**Desktop Component:** `apps/desktop/src/renderer/components/AuditLogViewer.tsx`

**Features:**
- Table view: timestamp, user, action, resource
- Filters: date range, action type, user
- Search by resource ID or metadata
- Export to CSV button

**UI Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Audit Logs                                          │
├─────────────────────────────────────────────────────┤
│ Filters: [Date Range] [Action] [User] [Search]     │
│                                              [Export]│
├─────────────────────────────────────────────────────┤
│ Timestamp          User       Action           Res. │
│ Feb 2, 2026 10:15  john.doe   campaign.created  ... │
│ Feb 2, 2026 10:14  jane.smith message.sent      ... │
│ ...                                                  │
└─────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- ✅ Logs load within 2 seconds for last 1000 entries
- ✅ Filters update results instantly
- ✅ CSV export downloads audit trail
- ✅ Accessible via navigation menu ("Compliance" section)

---

### **Milestone 4.3: Desktop Reporting UI** (2 days)

**Goal:** User-friendly reporting interface in desktop app with charts and export functionality.

#### 4.3.1 Campaign Reports UI (1 day)

**Component:** `apps/desktop/src/renderer/components/CampaignReports.tsx`

**Features:**
- **Campaign List View:**
  - Table: Campaign Name, Status, Recipients, Delivery Rate, Read Rate, Created At
  - Click campaign → detail report
  - Export all campaigns button

- **Campaign Detail View:**
  - Header: Campaign name, template, scheduled time
  - **Delivery Funnel Chart:** Bar chart showing Queued → Sent → Delivered → Read → Failed
  - **Timeline Chart:** Line chart showing message volume over time (hourly/daily)
  - **Metrics Cards:**
    - Total Recipients
    - Delivery Rate (sent/total %)
    - Read Rate (read/delivered %)
    - Avg Delivery Time
  - Export this campaign button

**Chart Libraries:**
- Use **recharts** (lightweight, React-friendly)
- Bar chart for delivery funnel
- Line chart for timeline

**UI Mockup:**
```
┌─────────────────────────────────────────────────────┐
│ Campaign: Holiday Sale Promo                        │
│ Template: holiday_sale_template                     │
│ Scheduled: Feb 1, 2026 9:00 AM                      │
├─────────────────────────────────────────────────────┤
│ Metrics                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ 5,234    │ │ 97.2%    │ │ 84.1%    │ │ 3.2 min  ││
│ │Recipients│ │ Delivery │ │ Read Rate│ │Avg Time  ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
├─────────────────────────────────────────────────────┤
│ Delivery Funnel                                     │
│ [Bar Chart]                                         │
│ Queued: 5234 | Sent: 5088 | Delivered: 4982 | ...  │
├─────────────────────────────────────────────────────┤
│ Timeline (Hourly Volume)                            │
│ [Line Chart]                                        │
└─────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- ✅ Campaign list loads within 2 seconds
- ✅ Charts render correctly with accurate data
- ✅ Export button downloads CSV
- ✅ Navigation between list and detail views

---

#### 4.3.2 Inbox Analytics UI (1 day)

**Component:** `apps/desktop/src/renderer/components/InboxAnalytics.tsx`

**Features:**
- **Summary Dashboard:**
  - Metrics cards: Total Conversations, Unread Messages, Avg Response Time, Active Today
  - Date range picker (last 7 days, 30 days, custom)
  - **Conversation Volume Chart:** Line chart (messages per day)
  - **Agent Performance Table:** Agent name, messages sent, avg response time

- **Export Options:**
  - Export all conversations (CSV)
  - Export agent statistics (CSV)

**UI Mockup:**
```
┌─────────────────────────────────────────────────────┐
│ Inbox Analytics                    [Last 7 Days ▼] │
├─────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ 1,234    │ │ 45       │ │ 12.3 min │ │ 342      ││
│ │Conversat.│ │ Unread   │ │ Response │ │Active    ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
├─────────────────────────────────────────────────────┤
│ Message Volume (Last 7 Days)                        │
│ [Line Chart: Inbound vs Outbound]                   │
├─────────────────────────────────────────────────────┤
│ Agent Performance                          [Export] │
│ Agent          Messages  Avg Response               │
│ John Doe       523       8.2 min                    │
│ Jane Smith     412       15.3 min                   │
└─────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- ✅ Dashboard loads within 2 seconds
- ✅ Date range filter updates charts
- ✅ Agent performance accurate (excludes automated replies)
- ✅ CSV exports download correctly

---

### **Milestone 4.4: Windows & macOS Packaging** (6 days)

**Goal:** Professional, signed installers for both platforms with auto-update capability.

#### 4.4.1 Electron Builder Configuration (1 day)

**Tool:** electron-builder (already in package.json)

**Config File:** `apps/desktop/electron-builder.yml`

**Windows Configuration:**
```yaml
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
  publisherName: "Your Company Name"
  certificateFile: "certificates/windows-cert.pfx"
  certificatePassword: ${WINDOWS_CERT_PASSWORD}

nsis:
  oneClick: true
  perMachine: false
  allowToChangeInstallationDirectory: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  license: LICENSE.txt
```

**macOS Configuration:**
```yaml
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  category: public.app-category.business
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  darkModeSupport: true

dmg:
  title: "WABSender Installer"
  icon: build/icon.icns
  contents:
    - x: 448
      y: 344
      type: link
      path: /Applications
    - x: 192
      y: 344
      type: file
```

**Code Signing:**
- Windows: PFX certificate (purchased from DigiCert/Comodo)
- macOS: Apple Developer ID certificate + notarization

**Acceptance Criteria:**
- ✅ Installer builds for Windows (NSIS .exe)
- ✅ Installer builds for macOS (DMG)
- ✅ Both installers signed with valid certificates
- ✅ macOS notarization passes (no Gatekeeper warnings)
- ✅ App version matches package.json

---

#### 4.4.2 Windows Installer (2 days)

**Deliverables:**
1. **NSIS Installer (.exe)**
   - One-click installation
   - Desktop shortcut
   - Start menu entry
   - Auto-launch on login (optional)
   - Uninstaller

2. **Code Signing:**
   - Purchase Windows code signing certificate
   - Sign installer with certificate
   - Verify: right-click installer → Properties → Digital Signatures

3. **Testing:**
   - Test on Windows 10 (x64)
   - Test on Windows 11 (x64)
   - Verify SmartScreen doesn't block (requires reputation build-up)

**Build Command:**
```bash
cd apps/desktop
npm run build:win
```

**Output:**
- `apps/desktop/dist/WABSender Setup 1.0.0.exe` (signed)

**Acceptance Criteria:**
- ✅ Installer runs on clean Windows 10/11 without errors
- ✅ App launches after installation
- ✅ Digital signature valid
- ✅ Uninstaller removes all files
- ✅ Installer size < 150 MB

---

#### 4.4.3 macOS Installer (2 days)

**Deliverables:**
1. **DMG Image**
   - Drag-to-Applications layout
   - Background image (optional)
   - Universal binary (x64 + arm64)

2. **Code Signing & Notarization:**
   - Sign with Apple Developer ID
   - Notarize with Apple (submit to notary service)
   - Staple notarization ticket to DMG

3. **Testing:**
   - Test on macOS 12 (Monterey) Intel
   - Test on macOS 13 (Ventura) Apple Silicon
   - Test on macOS 14 (Sonoma)
   - Verify no Gatekeeper warnings

**Build Command:**
```bash
cd apps/desktop
npm run build:mac
```

**Notarization Command:**
```bash
xcrun notarytool submit WABSender-1.0.0.dmg \
  --apple-id your-apple-id@example.com \
  --team-id YOUR_TEAM_ID \
  --password APP_SPECIFIC_PASSWORD \
  --wait
xcrun stapler staple WABSender-1.0.0.dmg
```

**Output:**
- `apps/desktop/dist/WABSender-1.0.0.dmg` (signed & notarized)

**Acceptance Criteria:**
- ✅ DMG opens without warnings
- ✅ App runs on both Intel and Apple Silicon Macs
- ✅ Notarization successful (spctl -a -v passes)
- ✅ Universal binary (lipo -info shows both architectures)
- ✅ DMG size < 200 MB

---

#### 4.4.4 Auto-Update Implementation (2 days)

**Library:** electron-updater (already in dependencies)

**Update Server:**
- Option 1: GitHub Releases (free, recommended for MVP)
- Option 2: Custom S3 bucket

**Implementation:**

1. **Update Checker (Main Process):**
   ```typescript
   // apps/desktop/src/main/updater.ts
   import { autoUpdater } from 'electron-updater';
   
   export function initAutoUpdater() {
     autoUpdater.checkForUpdatesAndNotify();
     
     autoUpdater.on('update-available', (info) => {
       // Notify renderer: new version available
       mainWindow.webContents.send('update-available', info.version);
     });
     
     autoUpdater.on('update-downloaded', (info) => {
       // Prompt user to restart and install
       mainWindow.webContents.send('update-downloaded', info.version);
     });
   }
   ```

2. **Update UI (Renderer Process):**
   ```typescript
   // apps/desktop/src/renderer/components/UpdateNotification.tsx
   useEffect(() => {
     window.electron.on('update-available', (version) => {
       showNotification(`New version ${version} is available. Downloading...`);
     });
     
     window.electron.on('update-downloaded', (version) => {
       showDialog({
         title: 'Update Ready',
         message: `Version ${version} has been downloaded. Restart to install?`,
         buttons: ['Restart Now', 'Later']
       });
     });
   }, []);
   ```

3. **GitHub Release Configuration:**
   ```yaml
   # electron-builder.yml
   publish:
     provider: github
     owner: your-username
     repo: WABSender
     releaseType: release
   ```

**Update Flow:**
1. App checks for updates on startup (and every 12 hours)
2. If new version available → download in background
3. When download complete → show notification
4. User clicks "Restart Now" → app quits and installs update
5. New version launches

**Acceptance Criteria:**
- ✅ Update check runs on app startup
- ✅ Background download doesn't block UI
- ✅ User prompted to install after download
- ✅ Update installed successfully on restart
- ✅ Works on both Windows and macOS
- ✅ Fallback gracefully if update server unavailable

---

### **Milestone 4.5: Final QA & Release Checklist** (3 days)

**Goal:** Comprehensive testing and production readiness validation.

#### 4.5.1 Security Audit (1 day)

**Checklist:**
- ✅ SQL injection prevention (parameterized queries everywhere)
- ✅ XSS prevention (React escapes by default, verify dangerouslySetInnerHTML not used)
- ✅ CSRF protection (verify auth token in headers, not cookies)
- ✅ Rate limiting on API endpoints (prevent abuse)
- ✅ Environment variables (no hardcoded secrets)
- ✅ HTTPS only (enforce in production)
- ✅ Webhook signature validation (WhatsApp webhook)
- ✅ Code signing certificates secured
- ✅ Dependency audit (npm audit, fix vulnerabilities)

**Tools:**
- Run `npm audit` on backend and desktop
- Static analysis: ESLint security plugin
- Manual review of auth and data access code

**Acceptance Criteria:**
- ✅ Zero critical vulnerabilities
- ✅ All high-severity vulnerabilities addressed
- ✅ Manual code review passes

---

#### 4.5.2 Compliance Validation (0.5 days)

**Checklist:**
- ✅ **Opt-In Enforcement:**
  - Verify contacts can only be messaged if opt_in_events exists
  - Verify opt-out handled (unsubscribe logic)
  
- ✅ **Data Retention:**
  - Verify retention_policy respected
  - Verify deleted_at filter in queries
  
- ✅ **Audit Logs:**
  - Verify all write operations logged
  - Verify audit logs immutable
  
- ✅ **WhatsApp Policies:**
  - No unofficial APIs used
  - Only approved templates sent
  - 24-hour messaging window respected

**Acceptance Criteria:**
- ✅ All compliance requirements documented
- ✅ Sample audit log export demonstrates full trail

---

#### 4.5.3 Performance Testing (0.5 days)

**Test Scenarios:**

1. **Campaign Load Test:**
   - Create campaign with 10,000 recipients
   - Verify scheduler processes queue without timeout
   - Verify rate limiting enforced (100 messages/sec)
   - Monitor memory usage (should stay < 500 MB)

2. **Inbox Load Test:**
   - Load conversation list with 1,000 conversations
   - Verify UI renders within 2 seconds
   - Send 10 inbound messages simultaneously
   - Verify WebSocket updates all within 3 seconds

3. **Report Load Test:**
   - Generate campaign report for 50,000-recipient campaign
   - Verify report renders within 5 seconds
   - Export CSV (should complete within 10 seconds)

**Tools:**
- Artillery for API load testing
- Chrome DevTools Performance profiler for UI

**Acceptance Criteria:**
- ✅ Campaign with 10k recipients completes
- ✅ Inbox with 1k conversations loads < 2s
- ✅ CSV export handles 50k rows without timeout
- ✅ Memory usage stable (no leaks)

---

#### 4.5.4 Cross-Platform Testing (1 day)

**Test Matrix:**

| Platform | Version | Tests |
|----------|---------|-------|
| Windows 10 | x64 | Installer, App Launch, All Features |
| Windows 11 | x64 | Installer, App Launch, All Features |
| macOS 12 | Intel | DMG Install, App Launch, All Features |
| macOS 13 | Apple Silicon | DMG Install, App Launch, All Features |
| macOS 14 | Intel + M1 | DMG Install, App Launch, All Features |

**Test Checklist (per platform):**
- ✅ Installer runs without errors
- ✅ App launches successfully
- ✅ Auth login works
- ✅ Contact import (CSV) works
- ✅ Campaign creation and sending works
- ✅ Inbox loads and manual reply works
- ✅ Automation triggers correctly
- ✅ Reports render with charts
- ✅ CSV export downloads
- ✅ Auto-update check runs (mock update)
- ✅ Uninstaller removes all files

**Acceptance Criteria:**
- ✅ All tests pass on all platforms
- ✅ No platform-specific bugs found
- ✅ UI consistent across platforms

---

#### 4.5.5 Release Checklist (Final Sign-Off)

**Pre-Release:**
- ✅ Version bumped in package.json (backend + desktop)
- ✅ CHANGELOG.md updated with release notes
- ✅ README.md updated with installation instructions
- ✅ LICENSE file included
- ✅ All Phase 4 milestones complete
- ✅ All tests passing
- ✅ Security audit passed
- ✅ Compliance validation passed
- ✅ Installers built and signed
- ✅ GitHub release created (with installers attached)

**Post-Release:**
- ✅ Monitor error logs for first 24 hours
- ✅ User acceptance testing with pilot customers
- ✅ Documentation published (user guide + admin guide)

---

## 📊 Phase 4 Dependencies & Risks

### Dependencies
- **Windows Code Signing Certificate:** Must purchase before Milestone 4.4.2 (est. $200-$400/year)
- **Apple Developer Account:** $99/year (required for macOS code signing + notarization)
- **GitHub Releases:** Free (or AWS S3 for update hosting, est. $10/month)
- **Chart Library:** recharts (already available)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Certificate purchase delays installer release | Medium | High | Purchase certificates at start of Phase 4.4 |
| macOS notarization takes 24-48 hours | High | Low | Budget 2 days for notarization in timeline |
| Large CSV exports timeout | Low | Medium | Implement streaming CSV export (already planned) |
| Performance issues on Windows 10 | Low | Medium | Test early on Windows 10 VM |
| Auto-update fails due to server downtime | Low | Medium | Use GitHub Releases (99.9% uptime) + fallback logic |

---

## 🚀 Phase 4 Timeline

**Estimated Start:** Upon approval  
**Estimated Completion:** 16 working days from start  

### Week 1 (Days 1-5)
- **Mon-Wed:** Milestone 4.1 (Campaign & Inbox Reporting APIs)
- **Thu-Fri:** Milestone 4.2 (Audit Logs & Compliance)

### Week 2 (Days 6-10)
- **Mon-Tue:** Milestone 4.3 (Desktop Reporting UI)
- **Wed:** Milestone 4.4.1 (Electron Builder Config)
- **Thu-Fri:** Milestone 4.4.2 (Windows Installer)

### Week 3 (Days 11-16)
- **Mon-Tue:** Milestone 4.4.3 (macOS Installer)
- **Wed-Thu:** Milestone 4.4.4 (Auto-Update)
- **Fri:** Milestone 4.5 (Final QA - Day 1)

### Week 4 (Days 14-16)
- **Mon-Wed:** Milestone 4.5 (Final QA - Days 2-3, Release Sign-Off)

---

## 📋 Acceptance Criteria (Phase 4 Complete)

**Technical Criteria:**
- ✅ All reporting APIs functional and returning accurate data
- ✅ CSV exports handle 50,000+ rows without timeout
- ✅ Audit log captures all user actions (immutable trail)
- ✅ Windows installer (.exe) signed and tested on Windows 10/11
- ✅ macOS installer (.dmg) notarized and tested on macOS 12-14
- ✅ Auto-update system functional on both platforms
- ✅ All Phase 4 code compiles without errors
- ✅ Security audit passed (zero critical vulnerabilities)
- ✅ Performance tests passed (load, stress, memory)

**Business Criteria:**
- ✅ Campaign delivery funnel report accurate and actionable
- ✅ Inbox analytics provide insights into agent performance
- ✅ Compliance requirements met (opt-in, audit logs, retention)
- ✅ Installers ready for distribution to customers
- ✅ Documentation complete (user guide, admin guide, release notes)

**User Acceptance:**
- ✅ Desktop app installs without warnings
- ✅ All features accessible from UI
- ✅ Reports render within 5 seconds
- ✅ CSV exports download successfully
- ✅ Auto-update notification clear and non-intrusive

---

## 📚 Deliverables Summary

### Code Deliverables
1. **Backend APIs:**
   - `/reports/campaigns`, `/reports/campaigns/:id`, `/reports/campaigns/export`
   - `/reports/inbox/summary`, `/reports/inbox/agents`, `/reports/inbox/export`
   - `/audit-logs`, `/audit-logs/export`

2. **Desktop UI Components:**
   - `CampaignReports.tsx` (list + detail views)
   - `InboxAnalytics.tsx` (dashboard + charts)
   - `AuditLogViewer.tsx` (compliance view)

3. **Utilities:**
   - `csvExporter.ts` (generic CSV generator)
   - `auditLog.ts` middleware (auto-capture)

4. **Packaging:**
   - `electron-builder.yml` (Windows + macOS config)
   - Windows installer (NSIS .exe)
   - macOS installer (DMG)
   - Auto-update integration

### Documentation Deliverables
1. **Phase 4 Completion Report** (similar format to Phase 3.5)
2. **User Guide** (how to use reporting, export data, install app)
3. **Admin Guide** (how to configure audit logs, retention policies)
4. **Release Notes** (v1.0.0 changelog)
5. **Installation Instructions** (Windows + macOS)

---

## 🎯 Next Steps (Awaiting Approval)

**Before Implementation Begins:**
1. ✅ User reviews this Phase 4 plan
2. ✅ User approves milestone breakdown and timeline
3. ✅ Purchase code signing certificates (Windows + macOS)
4. ✅ Confirm update hosting strategy (GitHub Releases recommended)

**Upon Approval:**
1. Start Milestone 4.1 (Campaign & Inbox Reporting APIs)
2. Update project planning doc with Phase 4 details
3. Create GitHub project board for Phase 4 tasks
4. Begin implementation according to timeline

---

## ✅ Review Checklist

- [ ] Phase 4 scope approved (reports, packaging, installers, auto-update)
- [ ] Milestone breakdown clear and achievable
- [ ] Timeline realistic (16 working days)
- [ ] Dependencies identified (certificates, Apple account)
- [ ] Risks documented with mitigation strategies
- [ ] Acceptance criteria comprehensive
- [ ] Deliverables align with business goals

**Ready to proceed upon your approval.**

---

**End of Phase 4 Plan**
