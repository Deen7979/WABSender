# Milestone 4.5 — Final QA & Release Sign-off

**Status**: In Progress  
**Start Date**: February 2, 2026  
**Target Completion**: February 9, 2026

---

## Objective

Execute comprehensive cross-platform testing and validation to ensure Milestone 4.4 packaging, signing, notarization, and auto-update functionality work correctly on all supported platforms before production release.

---

## Scope

### Testing Coverage

| Platform | OS Version | Installer | Processor | Test Status |
|----------|-----------|-----------|-----------|-------------|
| Windows | 10 (19044+) | NSIS .exe | x64 | 🔄 Pending |
| Windows | 11 | NSIS .exe | x64 | 🔄 Pending |
| macOS | 12+ | DMG + ZIP | Intel (x64) | 🔄 Pending |
| macOS | 12+ | DMG + ZIP | Apple Silicon (arm64) | 🔄 Pending |
| GitHub | Releases | All platforms | All | 🔄 Pending |

### Test Categories

1. **Build & Packaging** (per platform)
   - [ ] Installer generates without errors
   - [ ] File size is within expected range
   - [ ] File integrity check passes

2. **Installation** (per platform)
   - [ ] Installer runs without permissions errors
   - [ ] Installation dialog flow works correctly
   - [ ] App installed to correct location
   - [ ] Uninstall removes all files

3. **Application Launch & Functionality**
   - [ ] App window opens and renders correctly
   - [ ] React components load without errors
   - [ ] No console errors or warnings
   - [ ] DevTools available (View > Dev Tools)
   - [ ] All menu items functional

4. **Code Signing & Security**
   - [ ] Windows: Installer is code-signed (if enabled)
   - [ ] macOS: App is notarized (verified with spctl)
   - [ ] macOS: No "Unidentified Developer" warning on first launch
   - [ ] Gatekeeper accepts app on second launch

5. **Auto-Update System**
   - [ ] Help > Check for Updates menu item present
   - [ ] v0.1.0: Check for updates shows "latest version"
   - [ ] v0.1.1 published to GitHub
   - [ ] v0.1.0: Check for updates detects v0.1.1 available
   - [ ] Update downloads successfully
   - [ ] User receives restart prompt
   - [ ] After restart, app runs v0.1.1
   - [ ] Manual checks work on updated version

---

## Test Plan Execution

### Phase 1: Windows Testing

**Duration**: 2-3 days  
**Test Machines**: Windows 10 (Build 19044+), Windows 11

**Steps**:
1. Prepare build machine with build dependencies (Node, npm, Python)
2. Generate unsigned NSIS installer: `npm run dist`
3. Transfer installer to Windows 10 test machine
4. Execute [Windows 10 Test Suite](#windows-10-test-suite)
5. Execute [Windows 11 Test Suite](#windows-11-test-suite)
6. Document all results in [Test Results — Windows](MILESTONE-4.5-TEST-RESULTS.md#windows)

**See Also**: [MILESTONE-4.4-TESTING.md](docs/MILESTONE-4.4-TESTING.md) sections 2.1-2.3

---

### Phase 2: macOS Testing

**Duration**: 3-4 days  
**Test Machines**: Intel Mac (macOS 12+), Apple Silicon Mac (M1/M2/M3+)

**Prerequisites**:
- APPLE_ID and app-specific password configured
- APPLE_TEAM_ID available
- Build machine with macOS, Xcode, Node, npm

**Steps**:
1. Set environment variables: APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID
2. Build and notarize: `npm run dist`
3. Wait for notarization to complete (5-15 minutes)
4. Transfer .dmg files to test machines
5. Execute [macOS Intel Test Suite](#macos-intel-test-suite)
6. Execute [macOS Apple Silicon Test Suite](#macos-apple-silicon-test-suite)
7. Document results in [Test Results — macOS](MILESTONE-4.5-TEST-RESULTS.md#macos)

**See Also**: [MILESTONE-4.4-TESTING.md](docs/MILESTONE-4.4-TESTING.md) sections 3.1-3.4

---

### Phase 3: Auto-Update Testing

**Duration**: 1-2 days  
**Platforms**: All (Windows 10/11, macOS Intel, macOS Apple Silicon)

**Steps**:
1. [Publish v0.1.0 to GitHub Releases](#publish-v010)
2. [Test Initial Update Check](#test-initial-update-check)
3. [Publish v0.1.1 to GitHub Releases](#publish-v011)
4. [Test Update Detection & Installation](#test-update-detection-installation)
5. Document results in [Test Results — Auto-Update](MILESTONE-4.5-TEST-RESULTS.md#auto-update)

**See Also**: [MILESTONE-4.4-TESTING.md](docs/MILESTONE-4.4-TESTING.md) section 4

---

## Detailed Test Suites

### Windows 10 Test Suite

**Environment**: Windows 10 (Build 19044+), x64 processor

**Test Case W10-1: Installer Validation**
- [ ] Copy `WAB Sender Setup *.exe` to Windows 10 machine
- [ ] File size: 150-250 MB ✓
- [ ] Right-click → Properties → verify not blocked by security
- [ ] Double-click installer
- [ ] **Expected**: Installer UI appears

**Test Case W10-2: Installation Flow**
- [ ] License agreement screen appears
- [ ] Installation directory selection (default: Program Files)
- [ ] Start menu checkbox (default: checked)
- [ ] Desktop shortcut checkbox (default: unchecked)
- [ ] Click "Install"
- [ ] **Expected**: Installation completes without errors
- [ ] **Expected**: No reboot required

**Test Case W10-3: Post-Installation Verification**
- [ ] Check folder exists: `C:\Program Files\WAB Sender\`
- [ ] Start Menu has "WAB Sender" shortcut
- [ ] Start Menu has "Uninstall WAB Sender" shortcut
- [ ] Desktop has shortcut (if checked during install)
- [ ] Launch via Start Menu
- [ ] **Expected**: App window opens within 3 seconds

**Test Case W10-4: Application Functionality**
- [ ] Main window renders (title: "WAB Sender")
- [ ] View → Dev Tools opens without errors
- [ ] Console shows no errors or warnings
- [ ] File → Quit closes app cleanly
- [ ] App does not create any zombie processes

**Test Case W10-5: Update Check (Before v0.1.1 Published)**
- [ ] Launch app
- [ ] Help → Check for Updates
- [ ] **Expected**: "You are running the latest version"
- [ ] OK button closes dialog

**Test Case W10-6: Uninstall**
- [ ] Control Panel → Programs → Programs and Features
- [ ] Select "WAB Sender"
- [ ] Click "Uninstall"
- [ ] **Expected**: Uninstall wizard appears
- [ ] Click "Uninstall" to confirm
- [ ] **Expected**: Uninstall completes without errors
- [ ] **Expected**: Folder deleted: `C:\Program Files\WAB Sender\`
- [ ] **Expected**: Start Menu shortcuts deleted
- [ ] **Expected**: Desktop shortcut deleted (if existed)

**Status**: ⏳ Pending

---

### Windows 11 Test Suite

**Environment**: Windows 11, x64 processor

**Test Cases**: Repeat W10-1 through W10-6 (Windows 11 specific)

**Additional Checks**:
- [ ] Settings → Apps → Installed apps shows "WAB Sender"
- [ ] App works under Windows 11 app compatibility mode
- [ ] No compatibility mode warnings

**Status**: ⏳ Pending

---

### macOS Intel Test Suite

**Environment**: macOS 12+, Intel processor

**Test Case M-Intel-1: Build & Notarization**
- [ ] Machine: Intel Mac (macOS 12+)
- [ ] Build machine: Set env vars (APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID)
- [ ] Command: `npm run dist`
- [ ] **Expected**: Build succeeds
- [ ] **Expected**: "Notarization successful!" in console
- [ ] **Expected**: Both .dmg and .zip files generated
- [ ] Files: Transfer `WAB Sender-*.dmg` to Intel Mac

**Test Case M-Intel-2: Installation from DMG**
- [ ] Double-click `WAB Sender-*.dmg` on Intel Mac
- [ ] **Expected**: DMG mounts (appears on desktop)
- [ ] **Expected**: Finder window shows "WAB Sender.app"
- [ ] Drag "WAB Sender.app" to "Applications" folder
- [ ] Wait for copy (30-60 seconds)
- [ ] **Expected**: App appears in `/Applications/`
- [ ] Eject DMG from desktop

**Test Case M-Intel-3: First Launch & Gatekeeper**
- [ ] Open Applications folder (Cmd+Shift+A)
- [ ] Select "WAB Sender.app"
- [ ] **First launch**: Gatekeeper may show "Verify" dialog
  - [ ] If dialog appears: Click "Open"
  - [ ] If no dialog: Notarization is working correctly
- [ ] **Expected**: App window opens within 3 seconds
- [ ] **Expected**: Title bar shows "WAB Sender"

**Test Case M-Intel-4: Application Functionality**
- [ ] Main window renders correctly
- [ ] Menu bar shows "WAB Sender" app name (left side)
- [ ] Cmd+Option+I opens DevTools
- [ ] Console shows no errors or warnings
- [ ] Cmd+Q quits app cleanly

**Test Case M-Intel-5: Code Signing Verification**
```bash
# On build machine, after notarization:
spctl -a -v /Applications/WAB\ Sender.app
# Expected: "accepted source=Notarized Developer ID"

codesign -dv /Applications/WAB\ Sender.app
# Shows code signature and Team ID
```

**Test Case M-Intel-6: Update Check (Before v0.1.1)**
- [ ] Launch app
- [ ] Help → Check for Updates
- [ ] **Expected**: "You are running the latest version"

**Test Case M-Intel-7: Uninstall**
- [ ] Drag "WAB Sender.app" to Trash
- [ ] Empty Trash
- [ ] **Expected**: App removed from Applications
- [ ] Verify no leftover files in `~/Library/Application Support/WAB Sender`

**Status**: ⏳ Pending

---

### macOS Apple Silicon Test Suite

**Environment**: macOS 12+, Apple Silicon processor (M1, M2, M3+)

**Test Cases**: Repeat M-Intel-1 through M-Intel-7

**Additional Checks**:
- [ ] Build generates arm64 variant (electron-builder auto-detects)
- [ ] Filename includes `-arm64`: `WAB Sender-*-arm64.dmg`
- [ ] Install from arm64 DMG
- [ ] App runs **natively** (no Rosetta translation)
- [ ] Performance is smooth and responsive
- [ ] Activity Monitor shows ARM64 architecture (optional but recommended)

**Status**: ⏳ Pending

---

## Auto-Update Testing

### Publish v0.1.0

**Prerequisites**:
- GH_TOKEN environment variable set (GitHub personal access token)
- Repository has release capability

**Steps**:
```bash
cd apps/desktop

# Update version in package.json
# "version": "0.1.0"

npm run build
GH_TOKEN=your-github-token npm run dist:publish
```

**Validation**:
- [ ] Build completes without errors
- [ ] All installers generated (Windows, macOS Intel, macOS Apple Silicon)
- [ ] GitHub publish succeeds (check console output)
- [ ] Navigate to GitHub releases
- [ ] **Expected**: Release `v0.1.0` created with all installers
- [ ] **Expected**: All 5 assets uploaded:
  - `WAB Sender Setup 0.1.0.exe` (Windows)
  - `WAB Sender-0.1.0.dmg` (macOS Intel)
  - `WAB Sender-0.1.0.zip` (macOS Intel)
  - `WAB Sender-0.1.0-arm64.dmg` (macOS Apple Silicon)
  - `WAB Sender-0.1.0-arm64.zip` (macOS Apple Silicon)
- [ ] Release marked as "Latest Release"

**Status**: ⏳ Pending

---

### Test Initial Update Check (v0.1.0)

**Windows**:
- [ ] Install v0.1.0 from NSIS installer on Windows 10
- [ ] Launch app
- [ ] Wait 5 seconds (auto-check on startup)
- [ ] **Expected**: No update notification (v0.1.0 is latest)
- [ ] Help → Check for Updates
- [ ] **Expected**: Dialog: "You are running the latest version"
- [ ] Click OK

**macOS Intel**:
- [ ] Install v0.1.0 from DMG on Intel Mac
- [ ] Launch app (may show Gatekeeper dialog first)
- [ ] Wait 5 seconds
- [ ] **Expected**: No update notification
- [ ] Help → Check for Updates
- [ ] **Expected**: Dialog: "You are running the latest version"

**macOS Apple Silicon**:
- [ ] Install v0.1.0 from arm64 DMG on Apple Silicon Mac
- [ ] Launch app
- [ ] Wait 5 seconds
- [ ] **Expected**: No update notification
- [ ] Help → Check for Updates
- [ ] **Expected**: Dialog: "You are running the latest version"

**Status**: ⏳ Pending

---

### Publish v0.1.1

**Prerequisites**:
- v0.1.0 is running on test machines
- v0.1.0 GitHub release exists

**Steps**:
```bash
cd apps/desktop

# Update version in package.json
# "version": "0.1.1"

npm run build
GH_TOKEN=your-github-token npm run dist:publish
```

**Validation**:
- [ ] Build completes without errors
- [ ] All installers generated
- [ ] GitHub publish succeeds
- [ ] Release `v0.1.1` created with all 5 assets
- [ ] Release marked as "Latest Release"
- [ ] **Do not uninstall v0.1.0** (keep it running for update testing)

**Status**: ⏳ Pending

---

### Test Update Detection & Installation

**Windows**:
- [ ] Keep v0.1.0 running on Windows 10 (from previous test)
- [ ] Ensure v0.1.1 is published to GitHub
- [ ] Help → Check for Updates
- [ ] **Expected**: "Checking for updates..." message
- [ ] **Expected**: "A new version available" or download starts
- [ ] **Expected**: Auto-download in background
- [ ] **Expected**: Progress shows 0% → 100%
- [ ] **Expected**: Download completes successfully
- [ ] **Expected**: Dialog: "A new version has been downloaded. Restart to apply the update?"
- [ ] Click "Restart Now"
- [ ] **Expected**: App quits
- [ ] **Expected**: Update installed automatically
- [ ] **Expected**: App relaunches automatically
- [ ] **Expected**: About dialog (Help → About) shows v0.1.1
- [ ] View → Dev Tools: No errors in console

**macOS Intel**:
- [ ] Keep v0.1.0 running on Intel Mac
- [ ] Help → Check for Updates
- [ ] **Expected**: Same flow as Windows (checking → available → download → restart)
- [ ] Click "Restart Now"
- [ ] **Expected**: App restarts with v0.1.1
- [ ] Verify version in About dialog

**macOS Apple Silicon**:
- [ ] Keep v0.1.0 running on Apple Silicon Mac
- [ ] Help → Check for Updates
- [ ] **Expected**: arm64 update downloaded (correct architecture)
- [ ] Click "Restart Now"
- [ ] **Expected**: App restarts with v0.1.1
- [ ] Verify native execution (no Rosetta translation)

**Status**: ⏳ Pending

---

## Test Results Documentation

Use [MILESTONE-4.5-TEST-RESULTS.md](MILESTONE-4.5-TEST-RESULTS.md) to capture:
- Test date and tester name
- Platform details (OS, processor, build number)
- Build version tested
- Pass/fail for each test case
- Issues found (if any) with reproduction steps
- Screenshots or logs (if applicable)

---

## Defect Resolution Process

**If issues are found**:

1. **Document**: Record detailed reproduction steps in test results
2. **Prioritize**: Classify as critical, major, minor
3. **Fix**: Apply code changes or configuration fixes
4. **Re-test**: Execute affected test cases on all platforms
5. **Verify**: Confirm fix resolves issue without new side effects

**Critical Issues** (block release):
- App crashes on launch
- Auto-update fails or corrupts installation
- Code signing/notarization fails
- Platform-specific installation fails

**Major Issues** (delay release 1-2 days):
- Menu items not functional
- Console errors (non-critical)
- Update flow incomplete

**Minor Issues** (fix later):
- UI alignment issues
- Warning messages
- Documentation typos

---

## Final Release Checklist

After all testing completes, execute [MILESTONE-4.4-RELEASE-CHECKLIST.md](docs/MILESTONE-4.4-RELEASE-CHECKLIST.md):

- [ ] All test cases passed on all platforms
- [ ] Zero critical or major issues
- [ ] All sign-offs completed
- [ ] Release notes prepared
- [ ] Installer files backed up
- [ ] GitHub releases verified
- [ ] Documentation complete and published
- [ ] Product Owner approval

---

## Sign-Off Template

**Milestone 4.5 Testing Completion**

```
Developer: _____________________________
Date: __________________________________

Platform Testing Results:
- Windows 10: ☐ PASS  ☐ FAIL
- Windows 11: ☐ PASS  ☐ FAIL
- macOS Intel: ☐ PASS  ☐ FAIL
- macOS Apple Silicon: ☐ PASS  ☐ FAIL
- Auto-Update: ☐ PASS  ☐ FAIL

Critical Issues Found: ☐ YES  ☐ NO
Major Issues Found: ☐ YES  ☐ NO
Minor Issues Found: ☐ YES  ☐ NO

Release Ready: ☐ YES  ☐ NO

Product Owner Approval:
Name: ___________________________________
Date: ___________________________________
```

---

## Timeline

| Phase | Duration | Dates | Owner |
|-------|----------|-------|-------|
| Windows Testing | 2-3 days | Feb 2-4 | Test Team |
| macOS Testing | 3-4 days | Feb 4-7 | Test Team |
| Auto-Update Testing | 1-2 days | Feb 6-8 | Test Team |
| Defect Resolution | As needed | Feb 8-9 | Dev Team |
| Final Sign-off | 1 day | Feb 9 | Product Owner |
| **Release Date** | — | **Feb 9, 2026** | All |

---

## Success Criteria

✅ **Milestone 4.5 is complete when**:
1. All test cases passed on all platforms
2. Zero critical issues (or all fixed and re-tested)
3. All documentation updated and reviewed
4. Final release checklist completed and signed
5. Product Owner approval obtained
6. GitHub releases verified with all artifacts

---

## Next Steps

1. **Immediately**: Review this plan and test suites
2. **Tomorrow**: Begin Phase 1 (Windows Testing)
3. **Within 2 days**: Begin Phase 2 (macOS Testing)
4. **By Feb 8**: Complete Phase 3 (Auto-Update Testing)
5. **By Feb 9**: Final sign-off and production release

---

**Milestone 4.5 Plan Created**: February 2, 2026  
**Target Completion**: February 9, 2026  
**Status**: 🟢 Ready to Execute
