# WABSender Operations Guide

This guide explains how to operate WABSender from the user side and administration side, including licensing, activation, and super_admin org-context behavior.

---

## 1) User-Side Documentation

### Install the Application (Windows)
1. Download the Windows installer (`WABSender-Setup-<version>.exe`).
2. Run the installer and follow the prompts.
3. Launch WABSender from the Start Menu.

### First Launch Flow
1. **Activation screen** appears after login/registration.
2. **Registration/Login** (create account or sign in).
3. **Activation** with license key (binds to your device).
4. **Main app** unlocks after successful activation.

### Activate Using a License Key
1. Enter your license key on the Activation screen.
2. Click **Activate**.
3. On success, the app stores activation state locally and opens the main app.

### What Happens If...
- **License is invalid**: Activation fails with an error; access is blocked.
- **License is expired**: Activation/validation fails; access is blocked.
- **Device limit is reached**: Activation fails with an “activation limit reached” message.
- **License is revoked**: Validation fails on app start; activation screen is shown.

### After Login (Org Admin)
- Org admins can access Inbox, Campaigns, Templates, Settings, and License Management (admin-only).
- Org admins can issue/revoke licenses and deactivate device activations from Settings.

### Normal User Access
- Normal users can use core messaging features (Inbox, Campaigns, Templates).
- Normal users cannot access License Management or platform-level screens.

### Org Context Switching (super_admin)
- By default, **super_admin** sees the **Platform Dashboard** only.
- Use **Enter Org Context** to select an org.
- Once in org context, you can access org-level screens (Inbox, Campaigns, etc.).
- Use **Exit Org Context** to return to platform mode.

### Client-Side Configuration
- Set `VITE_API_URL` to your API base URL for desktop builds.
- Local activation state is stored in `localStorage`.

---

## 2) Administration-Side Documentation

### Platform-Level (super_admin)

#### Bootstrap a super_admin
Set environment variables and run:
```bash
cd services/api
npm run build
npm run bootstrap-admin
```

Env vars:
- `BOOTSTRAP_SUPER_ADMIN_EMAIL` (required)
- `BOOTSTRAP_SUPER_ADMIN_PASSWORD` (required)

#### Access Platform Dashboard
- Login as `super_admin`.
- Platform Dashboard lists orgs, users, and licenses.

#### Create Organizations
- **Current state**: Orgs are created via registration or seed. A dedicated platform org creation API is not implemented yet.

#### Generate and Seed Licenses
- Org admins can issue licenses in Settings.
- Platform view can list licenses across orgs.

#### Revoke or Deactivate Licenses
- Org admin routes allow revocation or device deactivation.
- Platform lists provide visibility; platform-level revocation endpoints are not yet provided.

#### Switch Org Context
- Use **Enter Org Context** from Platform Dashboard.
- The app sets `X-Org-Id` for all org-scoped API calls.

#### Manage Org Admins and Users
- **Current state**: No UI to manage users yet. Use database or custom admin tooling.

#### WebSocket Behavior Under Org Switching
- WebSocket connections use org context in query params.
- Switching org context triggers reconnection with the selected orgId.

#### Security Considerations
- `super_admin` is global and not bound to any org.
- Platform routes require `requireSuperAdmin`.
- Org routes require `X-Org-Id` for super_admin.

### Org-Level (admin)

#### Activate License for an Org
- Admins activate licenses during the activation flow after login.

#### Manage Users Within Org
- **Current state**: No org user management UI yet.

#### Limitations Compared to super_admin
- No platform dashboard access.
- Cannot view other orgs or platform-wide data.

---

## 3) Deployment & Environment

### Required Environment Variables (API)
- `DATABASE_URL`
- `WHATSAPP_TOKEN`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `GRAPH_API_VERSION`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_OAUTH_REDIRECT_URI`
- `ENCRYPTION_KEY`

### Optional Environment Variables
- `PORT`
- `FRONTEND_URL`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ORG_ID`
- `BOOTSTRAP_ORG_NAME`
- `BOOTSTRAP_SUPER_ADMIN_EMAIL`
- `BOOTSTRAP_SUPER_ADMIN_PASSWORD`

### Bootstrap Commands
```bash
cd services/api
npm run build
npm run bootstrap-admin
```

### Startup Hook Behavior
- If bootstrap env vars are present, the server attempts to create admin/super_admin.
- If an admin already exists in the org, bootstrap is skipped.
- If a super_admin already exists, bootstrap is skipped.

### Development
```bash
cd services/api
npm run build
npm run start

cd apps/desktop
npm run dev
```

### Production
- Build backend: `npm run build`
- Build desktop: `npm run dist`
- Set `VITE_API_URL` to production API URL for desktop builds.

### Publish Updates
See [docs/AUTO-UPDATE.md](docs/AUTO-UPDATE.md) for installer publishing and auto-update configuration.

### Backup / Migration
- Run database migrations with `npm run migrate`.
- Backup database before applying new migrations.

---

## 4) Security Model Overview

### License Validation Model
- License keys are hashed and validated server-side.
- Activation is required before main app access.

### Device Binding Logic
- Activations are tied to `deviceId`.
- Each license has a `max_devices` limit.

### Role Hierarchy
`super_admin` → `admin` → `user`

### Org Isolation
- Org-scoped routes require a valid org context.
- `super_admin` must provide `X-Org-Id` when accessing org routes.

### API-Level RBAC Enforcement
- `requireAdmin` for org admin routes.
- `requireSuperAdmin` for platform routes.

### WebSocket Context Isolation
- WebSocket connections are bound to an org context.
- Super admin must connect with org context to receive org events.
