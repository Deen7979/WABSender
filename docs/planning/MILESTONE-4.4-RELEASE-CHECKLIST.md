# Milestone 4.4 — Release Checklist

This document serves as the final validation checklist before releasing Milestone 4.4 (Windows & macOS Packaging) to production.

---

## Pre-Release Phase

### Code Quality & Compilation
- [ ] All TypeScript files compile without errors: `npx tsc --noEmit`
- [ ] No console errors in development build: `npm run dev`
- [ ] No React warnings or deprecations
- [ ] ESLint checks pass (if configured)
- [ ] All imports are resolved correctly

### Version Management
- [ ] Update `package.json` version (e.g., `"version": "0.1.0"`)
- [ ] Update `package-lock.json` with clean install: `npm ci`
- [ ] Verify version in About dialog: `app.getVersion()`
- [ ] Git tag matches version: `git tag v0.1.0`

### Dependencies & Security
- [ ] Run `npm audit` — no critical vulnerabilities
- [ ] Electron is up-to-date: `npm list electron`
- [ ] electron-builder is up-to-date: `npm list electron-builder`
- [ ] electron-updater is up-to-date: `npm list electron-updater`
- [ ] All dev dependencies are in devDependencies (not dependencies)

---

## Build Phase

### Production Build
- [ ] Clean build directory: `rm -rf dist/`
- [ ] Build succeeds: `npm run build`
- [ ] Output structure is correct:
  - [ ] `dist/renderer/index.html` exists
  - [ ] `dist/renderer/assets/` contains .js and .css files
  - [ ] `dist/main/index.js` exists (compiled main process)
  - [ ] `dist/main/*.js` files exist (window, menu, updater, preload)
- [ ] No build warnings or errors
- [ ] Bundle size is reasonable:
  - Renderer: ~2-5 MB (compressed)
  - Main: ~100-300 KB

### Asset Validation
- [ ] HTML entry point is valid: `dist/renderer/index.html`
- [ ] CSS files load correctly in bundled app
- [ ] Image assets are included (if any)
- [ ] Fonts are bundled (if any)

---

## Windows Packaging Phase

### Prerequisites
- [ ] Windows build machine available (or CI/CD)
- [ ] Code signing certificate available (if signing)
- [ ] CSC_LINK and CSC_KEY_PASSWORD set (if signing)

### Installer Generation
- [ ] Build succeeds: `npm run dist`
- [ ] NSIS installer generated: `dist/installers/WAB Sender Setup *.exe`
- [ ] Installer file size is reasonable (>150 MB)
- [ ] Installer is executable and not corrupted
- [ ] Code signing is valid (if CSC_LINK set):
  ```powershell
  Get-AuthenticodeSignature "path\to\WAB Sender Setup.exe"
  # Status should be "Valid"
  ```

### Windows 10 Installation Test
- **Test Machine**: Windows 10 (Build 19044+)
- [ ] Copy installer to Windows 10 machine
- [ ] Right-click installer → Run as Administrator (or double-click)
- [ ] License agreement appears
- [ ] Installation directory selection appears (allow default)
- [ ] Start menu shortcuts option works
- [ ] Desktop shortcut option works
- [ ] Installation completes without errors
- [ ] Application folder exists: `C:\Program Files\WAB Sender\`
- [ ] Start menu shortcut works (launch app)
- [ ] Desktop shortcut works (launch app)

### Windows 10 Functional Testing
- [ ] App window opens and displays correctly
- [ ] React components render without errors
- [ ] No console errors (View > Toggle DevTools)
- [ ] View > Reload refreshes app
- [ ] View > Dev Tools opens without errors
- [ ] Help > Check for Updates responds
- [ ] File > Quit closes app cleanly
- [ ] Taskbar icon shows correctly
- [ ] Window resizing works smoothly
- [ ] Zoom in/out functions work (View > Zoom In/Out)

### Windows 10 Uninstall Test
- [ ] Control Panel > Programs > Uninstall > WAB Sender
- [ ] Uninstall wizard appears
- [ ] Uninstall completes without errors
- [ ] Application folder deleted: `C:\Program Files\WAB Sender\`
- [ ] Start menu shortcuts deleted
- [ ] Desktop shortcut deleted (if created)
- [ ] Registry entries cleaned up

### Windows 11 Installation Test
- **Test Machine**: Windows 11
- [ ] Repeat Windows 10 steps (1.2, 1.3, 1.4)
- [ ] **Additional**: Check Windows App Compatibility (Settings > Apps > Installed apps)

---

## macOS Packaging Phase

### Prerequisites
- [ ] Build machines available:
  - [ ] Intel Mac (macOS 12+)
  - [ ] Apple Silicon Mac (M1, M2, M3, or newer)
- [ ] Apple Developer account with Team Admin role
- [ ] App-specific password generated (https://appleid.apple.com/)
- [ ] APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID set

### macOS Intel Build & Notarization
- [ ] On Intel Mac, build succeeds: `npm run dist`
- [ ] Notarization starts (watch console for status)
- [ ] Notarization completes successfully (5-15 min, wait for "Notarization successful!")
- [ ] Both installers generated:
  - [ ] `dist/installers/WAB Sender-<version>.dmg`
  - [ ] `dist/installers/WAB Sender-<version>.zip`
- [ ] File sizes are reasonable (~170-200 MB)
- [ ] Files are not corrupted

### macOS Intel Installation Test
- **Test Machine**: Intel Mac (macOS 12+)
- [ ] Copy `WAB Sender-<version>.dmg` to Intel Mac
- [ ] Double-click DMG file
- [ ] Volume mounts and Finder window opens
- [ ] Drag `WAB Sender.app` to Applications folder
- [ ] Copy completes successfully (may take 30-60 seconds)
- [ ] App appears in `/Applications/`
- [ ] Eject DMG volume

### macOS Intel Launch Test
- [ ] Single-click `WAB Sender.app` in Applications
- [ ] **First launch**: Gatekeeper may show verification dialog
  - [ ] If dialog appears, click "Open"
  - [ ] If no dialog, notarization is properly configured
- [ ] App window opens and displays correctly
- [ ] React components render without errors
- [ ] No console errors (Cmd+Option+I)
- [ ] Menu bar shows "WAB Sender" app name
- [ ] Help > Check for Updates responds
- [ ] Cmd+Q quits app cleanly

### macOS Intel Functional Testing
- [ ] File > New Window creates additional window
- [ ] Edit > Cut/Copy/Paste work (standard macOS behavior)
- [ ] View > Reload refreshes app
- [ ] View > Toggle DevTools opens
- [ ] View > Zoom In/Out functions work
- [ ] Window resizing and dragging works
- [ ] Spotlight search finds app: Cmd+Space → "WAB Sender"

### macOS Intel Uninstall Test
- [ ] Drag `WAB Sender.app` to Trash
- [ ] Empty Trash
- [ ] App is removed from Applications
- [ ] No leftover folders in `~/Library/Application Support/`

### macOS Apple Silicon Build & Notarization
- [ ] On Apple Silicon Mac, build succeeds: `npm run dist`
- [ ] electron-builder detects Apple Silicon and builds arm64 variant
- [ ] Notarization completes successfully
- [ ] Both installers generated:
  - [ ] `dist/installers/WAB Sender-<version>-arm64.dmg`
  - [ ] `dist/installers/WAB Sender-<version>-arm64.zip`

### macOS Apple Silicon Installation & Testing
- **Test Machine**: Apple Silicon Mac (M1, M2, M3, or newer)
- [ ] Repeat Intel steps (macOS Intel installation + launch tests)
- [ ] **Verify native execution**:
  - [ ] App runs natively (no Rosetta translation)
  - [ ] Performance is smooth and responsive
  - [ ] About dialog (or Activity Monitor) confirms ARM64 architecture

---

## Auto-Update Testing Phase

### Publish Initial Release (v0.1.0)

**On build machine**:
```bash
cd apps/desktop
# Update package.json: "version": "0.1.0"
npm run build
GH_TOKEN=your-github-token npm run dist:publish
```

- [ ] Build succeeds
- [ ] All installers created
- [ ] GitHub publish succeeds (check for errors)
- [ ] GitHub release created with all assets:
  - [ ] Release tag is `v0.1.0` or `0.1.0`
  - [ ] Windows installer uploaded
  - [ ] macOS Intel DMG uploaded
  - [ ] macOS Intel ZIP uploaded
  - [ ] macOS Apple Silicon DMG uploaded
  - [ ] macOS Apple Silicon ZIP uploaded
- [ ] Release marked as "Latest Release"

### Test Initial Install & Update Check (Windows)
- [ ] Install v0.1.0 from NSIS installer on Windows 10
- [ ] Launch app
- [ ] Wait 5 seconds (auto-check on startup)
- [ ] **Expected**: No update notification (v0.1.0 is latest)
- [ ] Click Help > Check for Updates
- [ ] **Expected**: Dialog shows "You are running the latest version."

### Test Initial Install & Update Check (macOS)
- [ ] Install v0.1.0 from DMG on Intel Mac
- [ ] Launch app
- [ ] Wait 5 seconds
- [ ] **Expected**: No update notification
- [ ] Click Help > Check for Updates
- [ ] **Expected**: Dialog shows "You are running the latest version."
- [ ] Repeat on Apple Silicon Mac

### Publish Update Release (v0.1.1)

**On build machine**:
```bash
cd apps/desktop
# Update package.json: "version": "0.1.1"
npm run build
GH_TOKEN=your-github-token npm run dist:publish
```

- [ ] Build succeeds
- [ ] All installers created for v0.1.1
- [ ] GitHub publish succeeds
- [ ] GitHub release created with v0.1.1 tag and all assets
- [ ] Release marked as "Latest Release"

### Test Update Available & Download (Windows)
- [ ] Keep v0.1.0 running on Windows 10 (from 3.2 test)
- [ ] Publish v0.1.1 to GitHub (see 3.3)
- [ ] In running v0.1.0 app: Help > Check for Updates
- [ ] **Expected**: "Checking for updates..." appears
- [ ] **Expected**: "Update available" message
- [ ] **Expected**: Auto-download starts (progress shown or in background)
- [ ] **Expected**: Download completes (0% → 100%)
- [ ] **Expected**: Prompt "A new version has been downloaded. Restart to apply the update?"
  - [ ] Click "Restart Now"

### Test Update Install (Windows)
- [ ] App closes
- [ ] Update is extracted and installed
- [ ] App relaunches automatically
- [ ] About dialog (Help > About) shows version v0.1.1
- [ ] No errors in console (View > Dev Tools)
- [ ] App functions normally on new version

### Test Update Available & Download (macOS)
- [ ] Keep v0.1.0 running on Intel Mac (from 2.3 test)
- [ ] Publish v0.1.1 to GitHub
- [ ] In running v0.1.0 app: Help > Check for Updates
- [ ] **Expected**: Same flow as Windows (checking → available → download → restart prompt)
- [ ] Click "Restart Now"
- [ ] App restarts with v0.1.1
- [ ] Verify version in About dialog

### Test Update on macOS Apple Silicon
- [ ] Keep v0.1.0 running on Apple Silicon Mac
- [ ] Trigger update check and installation
- [ ] **Expected**: arm64 update is downloaded and installed
- [ ] App restarts with v0.1.1 running natively

---

## Documentation Phase

### README.md Validation
- [ ] README includes:
  - [ ] Prerequisites (Node.js, Electron, etc.)
  - [ ] Quick start (development mode: `npm run dev`)
  - [ ] Build instructions (`npm run build`)
  - [ ] Installer creation (`npm run dist`)
  - [ ] Code signing setup (Windows):
    - CSC_LINK and CSC_KEY_PASSWORD explanation
    - Example certificate validation
  - [ ] Notarization setup (macOS):
    - APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID explanation
    - App-specific password generation link
    - Notarization verification commands
  - [ ] Auto-update publishing:
    - GitHub release workflow
    - GH_TOKEN setup
    - Publishing command with env vars
  - [ ] Full workflow example (all env vars combined)
  - [ ] Platform testing checklist
  - [ ] Environment variables reference link
  - [ ] Troubleshooting section

### ENVIRONMENT-VARIABLES.md Validation
- [ ] Document includes:
  - [ ] VITE_API_URL description and example
  - [ ] VITE_DEV_SERVER_URL description
  - [ ] CSC_LINK and CSC_KEY_PASSWORD documentation
  - [ ] APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID documentation
  - [ ] GH_TOKEN documentation with permission requirements
  - [ ] NODE_ENV documentation
  - [ ] Example .env.local file
  - [ ] CI/CD GitHub Actions example
  - [ ] Security best practices section
  - [ ] Troubleshooting for each variable group

### MILESTONE-4.4-TESTING.md Validation
- [ ] Document includes:
  - [ ] Pre-testing checklist
  - [ ] Development build validation steps
  - [ ] Production build validation steps
  - [ ] Windows 10 & 11 testing procedures
  - [ ] macOS Intel testing procedures
  - [ ] macOS Apple Silicon testing procedures
  - [ ] Auto-update flow testing (publish, initial check, update, restart)
  - [ ] Code signing verification steps
  - [ ] Final validation checklist
  - [ ] Troubleshooting section
  - [ ] Performance metrics/expected times

---

## Code Review Phase

### Main Process Files
- [ ] `src/main/index.ts`: App lifecycle, window creation, menu, updater
  - [ ] Proper imports and error handling
  - [ ] `app.ready` event creates window
  - [ ] `window-all-closed` and `activate` events handled
  - [ ] No console errors
- [ ] `src/main/window.ts`: BrowserWindow creation
  - [ ] Context isolation enabled (`contextIsolation: true`)
  - [ ] Node integration disabled (`nodeIntegration: false`)
  - [ ] Sandbox enabled (`sandbox: true`)
  - [ ] Preload path is correct
  - [ ] Dev server URL detection works
  - [ ] Production file loading works
  - [ ] DevTools opens in development
- [ ] `src/main/menu.ts`: Application menu
  - [ ] Receives mainWindow parameter
  - [ ] Check for Updates menu item triggers update check
  - [ ] macOS app menu is conditional (isMac platform check)
  - [ ] DevTools toggle is only in development
  - [ ] About dialog shows app version
- [ ] `src/main/updater.ts`: Auto-update lifecycle
  - [ ] `autoUpdater` imported from electron-updater
  - [ ] Only initializes in packaged builds
  - [ ] Auto-download enabled
  - [ ] Auto-install on app quit enabled
  - [ ] Downgrade not allowed
  - [ ] Event handlers send status to renderer
  - [ ] Update-downloaded prompt shows restart dialog
- [ ] `src/main/preload.ts`: Secure IPC bridge
  - [ ] Context isolation enabled
  - [ ] `contextBridge.exposeInMainWorld` used (not direct IPC)
  - [ ] Only required APIs exposed (`desktop.onUpdateStatus`)
  - [ ] No sensitive functions exposed

### Renderer Components
- [ ] `src/renderer/env.d.ts`: Type definitions
  - [ ] Vite env types defined
  - [ ] `VITE_API_URL` type is correct
- [ ] `src/renderer/components/CampaignReports.tsx`:
  - [ ] Uses `import.meta.env.VITE_API_URL`
  - [ ] Fallback to `localhost:3000` if not set
  - [ ] Progress elements used (not inline styles)
  - [ ] No TypeScript errors
- [ ] `src/renderer/components/InboxAnalytics.tsx`:
  - [ ] Uses `import.meta.env.VITE_API_URL`
  - [ ] Progress elements with correct max values
  - [ ] No TypeScript errors

### Configuration Files
- [ ] `electron-builder.yml`:
  - [ ] appId is unique (`com.wabsender.desktop`)
  - [ ] productName is correct
  - [ ] Output directory is `dist/installers`
  - [ ] Windows NSIS config is present
  - [ ] macOS DMG/ZIP targets configured
  - [ ] Notarization hook referenced
  - [ ] Code signing env var references correct
  - [ ] Publishing configured for GitHub
- [ ] `vite.config.ts`:
  - [ ] React plugin configured
  - [ ] Base is set to `./`
  - [ ] Output directory is `dist/renderer`
  - [ ] Empty out dir on build enabled
- [ ] `tsconfig.node.json`:
  - [ ] Target is ES2020
  - [ ] Module is CommonJS (not ESNext)
  - [ ] Output directory is `dist/main`
  - [ ] Root directory is `src/main`
- [ ] `package.json`:
  - [ ] Version is updated for release
  - [ ] `dev` script runs concurrent dev server + main
  - [ ] `build` script runs vite + tsc
  - [ ] `dist` script runs electron-builder
  - [ ] `dist:publish` script includes GH_TOKEN
  - [ ] All required devDependencies present
  - [ ] electron-updater in dependencies
- [ ] `scripts/notarize.js`:
  - [ ] Checks for APPLE_ID env vars
  - [ ] Calls @electron/notarize
  - [ ] Gracefully skips if env vars missing
  - [ ] No hardcoded credentials
- [ ] `scripts/entitlements.mac.plist`:
  - [ ] Hardened runtime enabled
  - [ ] JIT allowed (for Electron)
  - [ ] Library validation disabled

---

## Final Approval Phase

### Stakeholder Sign-off
- [ ] User/Product Owner reviews testing results
- [ ] User/Product Owner approves release
- [ ] Security review completed (if required)
- [ ] Legal review completed (if required)

### Git & Version Control
- [ ] All changes committed to git
- [ ] Commit message describes Milestone 4.4 completion
- [ ] Git tag created: `v0.1.0` (or current version)
- [ ] Branch is merged to `main` (or production branch)

### Release Notes
- [ ] Release notes created describing:
  - [ ] New Windows/macOS installers
  - [ ] Code signing and notarization improvements
  - [ ] Auto-update functionality
  - [ ] Installation instructions
  - [ ] Known issues (if any)
  - [ ] Supported platforms and versions

### Archive & Backup
- [ ] Installer files backed up to secure location
- [ ] Build logs archived
- [ ] GitHub release contents verified (not corrupted)
- [ ] Recovery plan in place (if rollback needed)

---

## Post-Release Phase

### Monitor & Support
- [ ] Monitor user installations via update checks
- [ ] Monitor GitHub releases for download stats
- [ ] Watch for bug reports or issues
- [ ] Respond to installation support requests
- [ ] Collect user feedback on installer experience

### Documentation Updates
- [ ] Update CHANGELOG.md with release info
- [ ] Create known issues list (if any)
- [ ] Document any workarounds for platform-specific issues
- [ ] Update developer wiki (if applicable)

### Next Milestone
- [ ] Schedule Milestone 4.5 kickoff (Final QA & Release Sign-off)
- [ ] Plan final testing and validation phase
- [ ] Identify remaining high-priority work
- [ ] Set production release date

---

## Sign-Off

**Completed by**: _________________________ (Developer)  
**Date**: _____________

**Reviewed by**: _________________________ (Code Reviewer)  
**Date**: _____________

**Approved by**: _________________________ (Product Owner)  
**Date**: _____________

---

**Release Date**: _____________  
**Production Version**: _____________  
**Installer Link**: _____________
