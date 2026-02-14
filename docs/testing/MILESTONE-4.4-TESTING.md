# Milestone 4.4 — Packaging & Auto-Update Testing Guide

This document provides comprehensive testing procedures for validating the Electron packaging, code signing, notarization, and auto-update functionality before release.

---

## Pre-Testing Checklist

- [ ] All TypeScript files compile without errors
- [ ] Environment variables are set correctly (see [Environment Variables Reference](#environment-variables-reference))
- [ ] GitHub repository is set up with release capability
- [ ] Code signing certificates are available (Windows) and Apple credentials are valid (macOS)
- [ ] Test machines are available:
  - Windows 10 (Build 19044+) or Windows 11
  - macOS 12+ with Intel processor
  - macOS 12+ with Apple Silicon processor

---

## 1. Build & Packaging Validation

### 1.1 Development Build (Unpackaged)

**Objective**: Verify dev server and main process work correctly in development mode.

```bash
# Terminal 1: Start dev server
cd apps/desktop
npm run dev:renderer

# Terminal 2: Start main process (in another terminal)
cd apps/desktop
npm run dev:main
```

**Validation Steps**:
1. ✅ Dev server starts on `http://localhost:5173`
2. ✅ Electron window opens and loads dev server
3. ✅ React components render correctly
4. ✅ Keyboard shortcuts work (Cmd+Option+I on macOS, Ctrl+Shift+I on Windows)
5. ✅ DevTools opens without errors
6. ✅ Hot module replacement (HMR) works when editing React files
7. ✅ Console shows no TypeScript or React errors

### 1.2 Production Build (Packaged)

**Objective**: Verify production build generates correct output structure.

```bash
cd apps/desktop
npm run build
```

**Validation Steps**:
1. ✅ Build completes without errors
2. ✅ Output structure exists:
   - `dist/renderer/` contains bundled React app (index.html, .js, .css files)
   - `dist/main/` contains compiled main process (index.js, window.js, menu.js, etc.)
3. ✅ `dist/renderer/index.html` is valid and references bundled assets
4. ✅ All environment variables are correctly resolved in bundle

---

## 2. Windows Installer Testing

### 2.1 NSIS Installer Generation

**Objective**: Create unsigned NSIS installer (code signing is optional for testing).

```bash
cd apps/desktop

# Generate installer without code signing
npm run dist

# OR with code signing (if certificate is available)
CSC_LINK=path/to/cert.pfx CSC_KEY_PASSWORD=password npm run dist
```

**Validation Steps**:
1. ✅ Build completes without errors
2. ✅ Installer file exists: `dist/installers/WAB Sender Setup <version>.exe`
3. ✅ File size is reasonable (>100MB, typically 150-250MB)
4. ✅ File is executable (not corrupted)

### 2.2 Windows 10 Installation Test

**Environment**: Windows 10 (Build 19044+) machine

**Procedure**:
1. Copy `dist/installers/WAB Sender Setup <version>.exe` to Windows 10 test machine
2. Double-click the installer
3. Follow installation prompts:
   - [ ] License agreement screen appears
   - [ ] Installation directory selection works (allow default `Program Files`)
   - [ ] Start menu shortcuts option is available
   - [ ] Desktop shortcut option is available

**Validation Steps**:
1. ✅ Installation completes without errors or warnings
2. ✅ Application folder exists in `Program Files\WAB Sender\`
3. ✅ Start menu shortcuts created (`WAB Sender`, `Uninstall WAB Sender`)
4. ✅ Desktop shortcut created (if selected)
5. ✅ Launch app from Start Menu
6. ✅ App window opens and loads correctly
7. ✅ No console errors appear
8. ✅ View > DevTools toggle works
9. ✅ File > Quit closes app cleanly
10. ✅ Uninstall via Control Panel removes all files

### 2.3 Windows 11 Installation Test

**Environment**: Windows 11 machine

**Procedure**: Repeat 2.2 steps on Windows 11

**Additional Validation**:
1. ✅ App runs under Windows 11 app compatibility
2. ✅ Windows Defender does not flag as suspicious
3. ✅ Signed installers are recognized as trusted (if code signing is enabled)

---

## 3. macOS Installer Testing

### 3.1 macOS Intel Build & Notarization

**Environment**: macOS 12+ with Intel processor

**Build and Notarize**:
```bash
cd apps/desktop

# Build and notarize (requires APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID)
APPLE_ID=your-apple-id@example.com \
APPLE_ID_PASSWORD=your-app-password \
APPLE_TEAM_ID=your-team-id \
npm run dist
```

**Expected Output**:
- `dist/installers/WAB Sender-<version>.dmg` (Intel DMG)
- `dist/installers/WAB Sender-<version>.zip` (Intel ZIP)

**Validation Steps**:
1. ✅ Notarization completes successfully (watch console for status)
2. ✅ DMG and ZIP files are generated
3. ✅ File sizes are reasonable (>150MB)

### 3.2 macOS Intel Installation Test

**Environment**: Intel Mac (macOS 12+)

**Procedure**:
1. Copy `WAB Sender-<version>.dmg` to Intel Mac
2. Double-click DMG file
3. Drag `WAB Sender.app` to `Applications` folder
4. Wait for copy to complete

**Validation Steps**:
1. ✅ DMG mounts without errors
2. ✅ Copy-to-Applications works (may take 30-60 seconds)
3. ✅ App appears in `/Applications/`
4. ✅ Launch app from Launchpad or Applications folder
5. ✅ First launch: "Verify" dialog may appear (Gatekeeper)
   - [ ] Click "Open" to allow first-run
6. ✅ App window opens and loads
7. ✅ Menu bar shows correct app name and menus
8. ✅ Cmd+Q quits app cleanly
9. ✅ Drag to Trash removes app and preferences

### 3.3 macOS Apple Silicon Build

**Environment**: macOS 12+ with Apple Silicon processor (M1, M2, M3, etc.)

**Build Configuration**:
```bash
cd apps/desktop

# electron-builder automatically detects Apple Silicon and builds arm64 variant
APPLE_ID=your-apple-id@example.com \
APPLE_ID_PASSWORD=your-app-password \
APPLE_TEAM_ID=your-team-id \
npm run dist
```

**Expected Output**:
- `dist/installers/WAB Sender-<version>-arm64.dmg` (Apple Silicon DMG)
- `dist/installers/WAB Sender-<version>-arm64.zip` (Apple Silicon ZIP)

### 3.4 macOS Apple Silicon Installation Test

**Environment**: Apple Silicon Mac (M1, M2, M3, or newer)

**Procedure**: Repeat 3.2 steps with Apple Silicon DMG

**Additional Validation**:
1. ✅ App runs natively on Apple Silicon (no Rosetta translation)
2. ✅ Performance is smooth (no emulation lag)
3. ✅ About dialog shows ARM64 architecture

---

## 4. Auto-Update Flow Testing

### 4.1 Test Environment Setup

**Prerequisites**:
1. GitHub repository with release capability
2. Two consecutive versions: v0.1.0 (initial) and v0.1.1 (update)
3. Both versions built and ready to publish

### 4.2 Publish Initial Release (v0.1.0)

**Build and Publish**:
```bash
cd apps/desktop

# Update version in package.json
# "version": "0.1.0"

npm run build
GH_TOKEN=your-github-token npm run dist:publish
```

**GitHub Release Setup**:
1. Create GitHub Release `v0.1.0`
2. Upload Windows installer: `WAB Sender Setup 0.1.0.exe`
3. Upload macOS Intel: `WAB Sender-0.1.0.dmg` and `.zip`
4. Upload macOS Apple Silicon: `WAB Sender-0.1.0-arm64.dmg` and `.zip`
5. Mark as "Latest Release"

### 4.3 Fresh Install & Update Check

**Windows Test**:
1. Uninstall previous versions if any
2. Install v0.1.0 using NSIS installer
3. Launch app
4. Wait 5 seconds (auto-check on launch)
5. **Expected**: "Checking for updates..." → "No updates" (since v0.1.0 is latest)
6. Click Help > Check for Updates manually
7. **Expected**: "You are running the latest version."

**macOS Intel Test**:
1. Uninstall previous version if any
2. Install v0.1.0 from DMG
3. Launch app
4. Wait 5 seconds
5. **Expected**: No update prompt (version is latest)
6. Click Help > Check for Updates
7. **Expected**: Dialog shows "You are running the latest version."

**macOS Apple Silicon Test**:
1. Repeat macOS Intel test with Apple Silicon DMG
2. **Expected**: App runs natively, update check shows latest

### 4.4 Publish Update Release (v0.1.1)

**Build and Publish**:
```bash
cd apps/desktop

# Update version in package.json
# "version": "0.1.1"

npm run build
GH_TOKEN=your-github-token npm run dist:publish
```

**GitHub Release Setup**:
1. Create GitHub Release `v0.1.1`
2. Upload all artifacts (Windows, macOS Intel, macOS Apple Silicon)
3. Mark as "Latest Release"

### 4.5 Update Available & Download Flow

**Windows Test**:
1. Keep v0.1.0 installed and running from previous test
2. Publish v0.1.1 to GitHub (see 4.4)
3. In running v0.1.0 app: Help > Check for Updates
4. **Expected**: "A new version available..."
5. Auto-download starts in background
6. **Expected**: Download progress shown (0% → 100%)
7. Download completes
8. **Expected**: "A new version has been downloaded. Restart to apply the update?"
9. Click "Restart Now"

**Validation Steps**:
1. ✅ App quits
2. ✅ Update is extracted and applied
3. ✅ App restarts automatically
4. ✅ About dialog shows v0.1.1
5. ✅ No errors in console logs

**macOS Test**: Repeat Windows test on both Intel and Apple Silicon

### 4.6 Rollback Test (Optional but Recommended)

**Procedure** (requires manual setup):
1. Install v0.1.1
2. Corrupt update cache: Delete `~/Library/Caches/WAB Sender/`
3. Restart app
4. Check for updates
5. **Expected**: Update fails gracefully with error message
6. App remains on v0.1.1 and continues functioning

---

## 5. Code Signing & Security Validation

### 5.1 Windows Code Signing Verification

**On Windows**:
```powershell
# Check if installer is signed
Get-AuthenticodeSignature "path\to\WAB Sender Setup 0.1.0.exe"
```

**Expected Output**:
```
SignerCertificate: [Certificate Details]
Status: Valid
```

### 5.2 macOS Notarization Verification

**On macOS**:
```bash
# Check notarization status
spctl -a -v /Applications/WAB\ Sender.app

# Check code signature
codesign -dv /Applications/WAB\ Sender.app
```

**Expected Output**:
```
/Applications/WAB Sender.app: accepted
source=Notarized Developer ID
```

### 5.3 Gatekeeper Acceptance Test

**On macOS**:
1. Launch app normally (not via terminal)
2. **Expected**: No "Unidentified Developer" warning
3. **Expected**: App runs without "Allow" dialog

---

## 6. Final Validation Checklist

Before releasing Milestone 4.4, verify all items:

### Build & Packaging
- [ ] Dev build works (HMR, DevTools, hot reload)
- [ ] Production build completes without errors
- [ ] Output structure is correct (dist/renderer, dist/main)

### Windows Testing
- [ ] NSIS installer generates successfully
- [ ] Windows 10 installation and launch works
- [ ] Windows 11 installation and launch works
- [ ] Uninstall removes all files
- [ ] Code signing is valid (if enabled)

### macOS Testing
- [ ] Intel build and notarization succeeds
- [ ] Apple Silicon build succeeds (arm64 detection works)
- [ ] Intel Mac installation and launch works
- [ ] Apple Silicon Mac installation and launch works (native, no translation)
- [ ] Gatekeeper accepts notarized app (no warnings)
- [ ] Notarization status is valid

### Auto-Update Testing
- [ ] v0.1.0 install and "check updates" shows latest
- [ ] v0.1.1 publish to GitHub succeeds
- [ ] v0.1.0 app detects v0.1.1 update available
- [ ] Download and install v0.1.1 succeeds
- [ ] App restarts cleanly on v0.1.1
- [ ] Help > Check for Updates works manually

### Documentation
- [ ] README includes all build commands
- [ ] README documents code signing setup (Windows)
- [ ] README documents notarization setup (macOS)
- [ ] README documents GitHub release publishing
- [ ] Environment variables reference is complete

---

## 7. Troubleshooting

### Windows Installer Issues

**Problem**: "Installer is not valid"
- **Solution**: Ensure output path is correct and installer file is not corrupted
- **Rebuild**: `npm run dist`

**Problem**: Windows Defender flags as suspicious
- **Solution**: Implement code signing with valid certificate
- **Reference**: See [Code Signing Guide](#windows-code-signing)

### macOS Notarization Issues

**Problem**: "Could not validate notarization"
- **Solution**: Check APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID env vars
- **Verify**: `echo $APPLE_ID` (should not be empty)

**Problem**: "Gatekeeper rejects app"
- **Solution**: Re-notarize with correct Team ID
- **Rebuild**: `npm run dist` with correct env vars

### Auto-Update Issues

**Problem**: "Update available but download fails"
- **Solution**: Verify GitHub release has correct artifacts for platform
- **Check**: GitHub releases page shows `.exe`, `.dmg`, `.zip` files

**Problem**: "App doesn't auto-check for updates"
- **Solution**: Only works in packaged builds (not in dev mode)
- **Verify**: `npm run build && npm run dist` then test with packaged app

---

## 8. Performance Metrics

Expected build and update times:

| Operation | Windows | macOS Intel | macOS Apple Silicon |
|-----------|---------|-------------|---------------------|
| `npm run build` | 20-30s | 20-30s | 15-25s |
| `npm run dist` | 30-45s | 45-60s (notarization) | 45-60s (notarization) |
| Installer size | 150-180MB | 170-200MB | 140-170MB |
| Auto-update download | 20-40s (depends on network) | 20-40s | 20-40s |
| Auto-update install | 5-10s | 5-10s | 5-10s |

---

## Next Steps

After completing all testing:
1. Document any issues found in [PHASE-4.5-COMPLETION.md](./PHASE-4.5-COMPLETION.md)
2. Fix any critical bugs
3. Re-test affected functionality
4. Proceed to Milestone 4.5 — Final QA & Release Sign-off
