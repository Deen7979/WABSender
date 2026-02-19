# WABSender — Project Features and Function Summary

This document summarizes the functions, features, architecture decisions, and runtime details discovered in the repository. It is intended as a single-source reference for developers, testers, and operators.

## Overview
- Multi-part application with a desktop Electron frontend (`apps/desktop`) and backend services under `services/api`.
- Key concerns: user authentication, organization context switching, license activation per-device, real-time messaging via WebSocket, campaigns, templates, inbox, user & license management, monitoring, and scheduled jobs (campaign scheduler / queue worker).

## Top-level pieces
- Desktop application: `apps/desktop`
  - Renderer (React + TypeScript) in `src/renderer`.
  - Main process in `src/main` (Electron entry points — `index.ts`, `window.ts`, `updater.ts`, `menu.ts`, etc.).
  - Build config: `electron-builder.yml`, `vite.config.ts`, and `package.json`.
  - Desktop script hooks under `scripts/` (mac entitlements, notarize helper).
- Backend services: `services/api`
  - Node/TypeScript server with `src/index.ts`, `src/server.ts`, `config`, `db` (migrations + seeds), `routes`, `services`, `jobs` (campaignScheduler, queueWorker), `scripts` (migration and seed helpers).
  - Tests under `services/api/tests` (example: `conversation-reply.test.ts`).
- Documentation and planning under `docs/`, `architecture/`, `planning/`, and `operations/`.

## Frontend (Renderer) — key behaviors and flows
The main React entry component is `apps/desktop/src/renderer/App.tsx`. It implements app-level state and orchestrates authentication, API client creation, WebSocket connections, activation checks, and view routing.

Major behaviors:
- API base URL resolution via environment variables: `VITE_API_URL` or `REACT_APP_API_URL` with fallback to `http://localhost:4000`.
- Local storage keys used: `accessToken`, `refreshToken`, `orgName`, `orgContextId`, `orgContextName`, `licenseActivation`, `deviceId`.
- JWT handling: JWT `accessToken` is decoded (via `atob` on the token's payload) to extract `orgId` and `role`.
- Roles: `super_admin`, `admin`, and regular users (role-based UI and flow differences).
  - `super_admin` users can view the `PlatformDashboard` and select an `orgContext`. When in an org context they can `Exit Org Context`.
  - `admin` users have access to `LicenseManagement`, `UserManagement`, and `SystemMonitoring` in `Settings`.
- Device identification: attempts to fetch `deviceId` from `window.desktop.getDeviceId()` (Electron API) or falls back to a persisted `deviceId` created with `crypto.randomUUID()`.
- Authentication lifecycle:
  - If no `accessToken` stored, the `AuthScreen` is shown.
  - On login success, `accessToken` and `refreshToken` saved and JWT decoded to set `orgId` and `role`.
  - `clearAuthState()` clears tokens, localStorage, role, org context, and closes the WebSocket.
- API client & token refresh:
  - `createApiClient(API_BASE_URL, () => accessToken, () => orgContextId)` builds an API client that can call backend endpoints and refresh tokens.
  - If the access token is expired (via `isTokenExpired`), the client attempts to `refresh` using `refreshToken`, calling `setTokens` and updating `accessToken` state.
  - If refresh fails, the user is logged out.
- WebSocket lifecycle:
  - `connectWebSocket(API_BASE_URL, token, messageHandler, orgContextId, errorHandler, closeHandler)` established when `accessToken` is present.
  - `closeHandler` checks for auth closure codes (1008) and triggers an attempt to get a valid token via `getValidAccessToken()` and re-set `accessToken` to cause reconnect.
- License activation:
  - For non-`super_admin` users the app validates device license via `apiClient.validateLicense(deviceId)` and persists `licenseActivation` info in localStorage.
  - `ActivationScreen` is shown when activation is required.
- Views implemented (main nav): `Inbox`, `Campaigns`, `Templates`, `Settings`.
  - Components referenced: `CampaignContainer`, `InboxContainer`, `TemplatesPage`, `WhatsAppConnection`, `LicenseManagement`, `UserManagement`, `SystemMonitoring`, `PlatformDashboard`.

## Services and APIs (backend)
- Typical server structure present: `src/server.ts`, `src/index.ts`, configuration module `config/`, `db/` helpers and migrations, `routes/` and `middleware/`.
- Jobs and background processing:
  - `campaignScheduler.ts` — likely schedules and enqueues campaign messages.
  - `queueWorker.ts` — processes queued messages / tasks (send messages, handle retries).
- Database scripts: `seed.mjs`, `run-migration.mjs`, and helpers under `scripts/` for resetting and seeding DB.
- WebSocket server endpoints: the client connects with a token and org context; server-side likely validates JWT and authorizes subscriptions.

## Security and Auth
- JWT-based auth with short-lived access tokens and refresh token flows.
- Client attempts to transparently refresh tokens before using them for critical flows (WebSockets, API calls).
- Role-based UI flows: `super_admin` can switch contexts; `admin` has elevated management UI.
- License activation tied to `deviceId` (server validates devices and returns activation info including plan and expiry).

## Data flow and storage
- LocalStorage is used for caching tokens, org context, org name, license activation details, and device id.
- JWT stores `orgId` and `role` in payload for client-side decisions.
- When super_admin selects an org context, that context id and name are persisted and used for API calls and WS messages.

## Developer-facing notes & conventions
- Environment variables: set `VITE_API_URL` (preferred for Vite/Electron renderer) or `REACT_APP_API_URL`.
- Device ID retrieval integrates with Electron main process if `window.desktop.getDeviceId()` is implemented.
- Key scripts for backend live in `services/api/scripts/`:
  - `run-migration.mjs`, `reset-db.mjs`, `seed.mjs`, `check-schema.mjs`, `fix-schema.mjs`.
- Tests exist inside `services/api/tests`. Run the test suite with the backend's package.json scripts (see `services/api/package.json`).

## UX and features (user-visible)
- Inbox: Real-time message display via WebSocket.
- Campaigns: Create and schedule broadcast campaigns; background scheduler handles dispatching.
- Templates: Manage message templates for campaigns and replies.
- Settings:
  - WhatsApp connection management (device linking or connection status component).
  - License and user management for `admin` users.
  - System monitoring for health and metrics.
- Platform dashboard for `super_admin` to view and enter organization contexts.

## Error handling and robustness
- WebSocket close-handling includes checks for auth-related closes (1008) and will attempt to refresh token and reconnect.
- API calls treat `Invalid token` and `Unauthorized` responses as triggers to clear authentication state.
- Auto-select logic for `super_admin`: if no `orgContextId` set, the app calls `listPlatformOrgs()` and selects the first available org as a convenience.

## Operator notes
- License activation: server returns activation info including `activationId`, `licenseId`, `planCode`, `expiresAt`. Keep storage and expiry checking in sync with server.
- For production builds of the desktop app, follow packaging steps configured under `electron-builder.yml` and `scripts/notarize.js` (macOS specific entitlements handled).
- For local development, ensure `VITE_API_URL` points to the running backend.

## Recommended next steps (developer)
- Add explicit types for `apiClient` to make usage clearer in renderer components.
- Centralize token refresh logic to reduce duplicated error handling across API calls and WS reconnects.
- Add unit tests for critical renderer flows: token refresh + WebSocket reconnect logic.
- Add automated E2E tests that exercise the login -> activation -> inbox flows.

## Quick reference (important files)
- App entry (renderer): [apps/desktop/src/renderer/App.tsx](apps/desktop/src/renderer/App.tsx)
- Electron main: [apps/desktop/src/main/index.ts](apps/desktop/src/main/index.ts)
- API server entry: [services/api/src/index.ts](services/api/src/index.ts)
- Background jobs: [services/api/src/jobs/campaignScheduler.ts](services/api/src/jobs/campaignScheduler.ts) and [services/api/src/jobs/queueWorker.ts](services/api/src/jobs/queueWorker.ts)
- Scripts (DB & migrations): [services/api/scripts](services/api/scripts)

---

This document was generated by analyzing the repository structure and the main renderer app flow. If you want, I can expand any section (detailed API endpoint mapping, sequence diagrams, or a checklist for packaging and deployment).
