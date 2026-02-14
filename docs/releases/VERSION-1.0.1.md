# Version 1.0.1 Release Notes

## Changelog

### Features
- Added new conversation actions (archive/close) in the desktop app.
- Enhanced message metadata with status icons and timestamps.
- Improved bottom chat behavior for scroll stability and template sending.

### Fixes
- Resolved issues with template send button visibility.
- Fixed UI flicker during template selection.
- Addressed scroll reset issues in the chat panel.

### Backend Updates
- Optimized WebSocket handling for real-time updates.
- Improved database query performance for message retrieval.

## Instructions

### Database Migrations
Run the following command to apply the latest database migrations:
```bash
npm run migrate
```

### Build Artifacts
#### Desktop App
1. Navigate to the `apps/desktop` directory.
2. Run the following command to build the desktop app:
   ```bash
   npm run build
   ```

#### Backend Service
1. Navigate to the `services/api` directory.
2. Run the following command to build the backend service:
   ```bash
   npm run build
   ```

### Publish Release
1. Publish the desktop app artifacts.
2. Deploy the backend service to the production environment.

---
Release Date: February 10, 2026