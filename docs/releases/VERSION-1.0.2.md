# Version 1.0.2 Release Notes

## Changelog

### Features
- **Template Synchronization**: Automatic fetching and synchronization of WhatsApp Business API templates after OAuth setup
- **Webhook Verification**: Secure HMAC-SHA256 webhook signature verification with timing-safe comparison
- **Webhook Health Tracking**: Real-time status monitoring for webhook verification and template sync operations
- **Enhanced WhatsApp Connection UI**: Added template sync status display with manual sync capability

### Fixes
- **Layout Stability**: Fixed UI layout shift issues when switching between Inbox and Campaigns views by replacing nested `100vh` containers with flex-based layout
- **Scroll Behavior**: Improved scroll position stability and eliminated unexpected page jumping
- **Container Overflow**: Changed main content wrapper from `overflow: hidden` to `overflowY: auto` for proper scrolling

### Backend Updates
- **Template Sync Service**: New service for fetching APPROVED templates from Meta Graph API v19.0
- **Webhook Handler**: Enhanced webhook processing with security verification
- **Database Schema**: Added webhook_health table for tracking sync status and verification state
- **API Routes**: New endpoints for template synchronization and webhook status monitoring

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