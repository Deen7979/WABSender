# Version 1.2.0 Release Notes

## Changelog

### Features
- **Licensing & Activation**: Product activation flow with device binding, server validation, and local activation state.
- **License Management**: Admin license issuance, revocation, device deactivation, and activation listing.
- **Platform Super Admin**: New `super_admin` role with platform dashboard and org context switching.
- **Bootstrap Admin**: Environment-based bootstrap for admin and super admin creation.

### Backend Updates
- **Database Schema**: License tables, super admin support, and role/org constraints.
- **API Routes**: License activation/validation, admin licensing routes, platform routes for org/user/license listings.
- **RBAC**: `requireAdmin` and `requireSuperAdmin` enforcement with org context validation.
- **WebSocket Context**: Super admin org context support via query param.

### UI Updates
- **Activation UI**: Dedicated activation screen and persistent activation state.
- **Platform Dashboard**: Org/user/license summaries with org context entry.
- **Admin Banner**: Role + org context display in Settings.
- **License Management UI**: Issue, revoke, and deactivate device activations.

## Instructions

### Database Migrations
Run the following command to apply the latest database migrations:
```bash
cd services/api
npm run migrate
```

### Build Artifacts
#### Desktop App
1. Navigate to the `apps/desktop` directory.
2. Run the following command to build the desktop app:
   ```bash
   npm run build
   ```
3. Create distributable packages:
   ```bash
   npm run dist
   ```

#### Backend Service
1. Navigate to the `services/api` directory.
2. Run the following command to build the backend service:
   ```bash
   npm run build
   ```

### Publish Release
1. Publish the desktop app artifacts to distribution channels.
2. Deploy the backend service to the production environment.
3. Update any deployment configurations with the new version numbers.

---
Release Date: February 12, 2026
