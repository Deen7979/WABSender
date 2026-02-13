# Version 1.2.1 Release Notes

## Changelog

### Bug Fixes
- **CSS Compatibility**: Added `-webkit-user-select` prefix to support Safari and Safari on iOS browsers in PlatformDashboard component.

## Instructions

### Database Migrations
No database migrations required for this patch release.

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

### Deployment
1. Deploy the backend service to your server.
2. Distribute the desktop app packages to users.

## Previous Version
See [VERSION-1.2.0.md](VERSION-1.2.0.md) for the previous release notes.