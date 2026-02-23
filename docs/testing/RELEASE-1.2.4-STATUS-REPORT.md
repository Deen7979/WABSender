# Release v1.2.4 Status Report

**Date**: February 22, 2026  
**Author**: Release Automation  
**Status**: ⚠️ BLOCKED — Oversized Installer Detected

---

## Executive Summary

v1.2.4 release hardening automation is implemented and functional. **Critical blocker detected**: Windows installer is 1.8 GB (expected: ~150 MB), preventing upload to GitHub releases via automated workflow and manual PowerShell attempts due to request timeouts.

**Root cause**: Electron/electron-builder appears to be bundling unintended large dependencies or not applying compression correctly.

---

## Release Automation Deliverables

### ✅ Completed

1. **Hardened Publish Workflow** (`release:publish:verified`)
   - Single-command publish with automatic retry (up to 3 attempts)
   - Transient NSIS file cleanup between attempts
   - GitHub release asset verification
   - Missing asset upload fallback
   - Verification report generation (`release-verification-<version>.json`)

2. **Subscription Audit Log Feature**
   - Backend returns audit events in license detail API response
   - Frontend renders audit log table in expanded license card
   - Proper styling and responsive layout

3. **Documentation Updates**
   - [docs/operations/AUTO-UPDATE.md](../operations/AUTO-UPDATE.md) — New publish+verify command
   - [docs/releases/VERSION-1.2.4.md](../releases/VERSION-1.2.4.md) — Release notes updated
   - Created this comprehensive status report

### ❌ Blocked

1. **v1.2.4 GitHub Release Asset Completion**
   - Only 2 of 3 required assets uploaded:
     - ✅ `WABSender-Setup-1.2.4.exe.blockmap` (1.92 MB)
     - ✅ `latest.yml` (348 B)
     - ❌ `WABSender-Setup-1.2.4.exe` (1.8 GB — BLOCKER)

2. **Desktop QA Matrix Execution**
   - Pending installer size fix before Windows 10/11 manual QA
   - macOS builds not attempted (Windows build blockers first)

---

## Detailed Findings

### Installer Size Investigation

**Local Artifact Inventory** (`apps/desktop/dist/installers/`):

| File | Size | Status |
|------|------|--------|
| `WABSender-Setup-1.2.4.exe` | **1.8 GB** | ⚠️ **BLOCKER** |
| `WABSender-Setup-1.2.4.exe.blockmap` | 1.92 MB | ✅ Uploaded |
| `latest.yml` | 348 B | ✅ Uploaded |
| `WABSender-Setup-1.2.0.exe` | 153 MB | ✅ (Historical baseline) |
| `WABSender-Setup-1.2.1.exe` | 307 MB | 🟡 (Doubled from 1.2.0) |

**Size Progression Analysis**:
- v1.2.0 → v1.2.1: **+100% size increase**
- v1.2.1 → v1.2.4: **+500% size increase**

**Probable Causes**:
1. `node_modules` included in bundled resources (missing `.asarUnpack` or `files` filter)
2. Development dependencies bundled into production build
3. Vite build output not being tree-shaken correctly
4. Large test/sample data inadvertently included
5. Duplicate dependencies from monorepo structure

---

## GitHub Release Status

**Release URL**: https://github.com/Deen7979/WABSender/releases/tag/v1.2.4  
**Published**: February 22, 2026 02:35:07 GMT+0530

**Current Assets**:
- ✅ `WABSender-Setup-1.2.4.exe.blockmap` (667,964 bytes)
- ✅ `latest.yml` (348 bytes)

**Missing Assets**:
- ❌ `WABSender-Setup-1.2.4.exe` (upload fails after ~30-60 sec due to size/timeout)

**electron-updater Compatibility**: ⚠️ **BROKEN**  
The auto-updater requires all three files to function. Missing `.exe` prevents users from receiving updates.

---

## Attempted Remediation

### Workflow Retry Attempts (3x)

All three automated publish attempts succeeded in:
- Building renderer + main process
- Generating NSIS installer
- Detecting existing release (electron-builder skips re-upload for >2hr old releases)

All three attempts failed at GitHub API verification step:
- `fetch failed` error when querying release assets
- Suspected transient network issues or rate limiting during high-frequency retry loop

### Manual Upload Attempts (PowerShell)

Direct GitHub REST API upload via `Invoke-RestMethod`:
- ❌ Request timeouts after ~30-60 seconds (1.8 GB payload)
- ❌ No progress indication from `Invoke-RestMethod` for large binaries
- ❌ Attempted 4 different URI construction approaches

---

## Immediate Action Plan

### Phase 1: Diagnose Installer Bloat (Priority: CRITICAL)

**Investigate `electron-builder.yml` Configuration**:

```yaml
# Current config (apps/desktop/electron-builder.yml)
files:
  - dist/**
asar: true
```

**Action**: Restrict `files` to:

```yaml
files:
  - dist/renderer/**
  - dist/main/**
  - "!dist/installers/**"
  - "!dist/**/*.map"
  - "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}"
  - "!**/node_modules/.bin"
  - "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}"
  - "!.editorconfig"
  - "!**/._*"
  - "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}"
  - "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}"
  - "!**/{appveyor.yml,.travis.yml,circle.yml}"
  - "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
```

**Verify Actual Bundle Contents**:

```powershell
# Extract and inspect unpacked app
cd apps/desktop/dist/installers/win-unpacked
Get-ChildItem -Recurse | 
  Measure-Object -Property Length -Sum |
  Select-Object @{Name="TotalMB";Expression={[math]::Round($_.Sum/1MB,2)}}

# Find largest directories
Get-ChildItem -Recurse -Directory | 
  ForEach-Object { 
    @{
      Path=$_.FullName; 
      SizeMB=[math]::Round((Get-ChildItem $_.FullName -Recurse -File | 
        Measure-Object -Property Length -Sum).Sum/1MB,2)
    }
  } | 
  Sort-Object SizeMB -Descending | 
  Select-Object -First 10
```

**Check for Errant Includes**:

```powershell
# Look for node_modules leakage
Get-ChildItem -Path "apps/desktop/dist/installers/win-unpacked" -Recurse -Directory -Filter "node_modules"

# Look for .git folders
Get-ChildItem -Path "apps/desktop/dist/installers/win-unpacked" -Recurse -Directory -Filter ".git"

# Look for test/sample data
Get-ChildItem -Path "apps/desktop/dist/installers/win-unpacked" -Recurse -File | 
  Where-Object { $_.Name -match "(test|spec|sample|fixture|mock)" }
```

### Phase 2: Rebuild + Upload (Priority: HIGH)

Once `electron-builder.yml` is corrected:

```powershell
cd apps/desktop

# Clean previous build artifacts
Remove-Item -Recurse -Force dist

# Rebuild with fixed config
npm run build

# Generate installer
npm run dist

# Verify size (should be ~150-200 MB)
Get-Item dist/installers/WABSender-Setup-1.2.4.exe | Select-Object Name,@{N="MB";E={[math]::Round($_.Length/1MB,2)}}

# If size is acceptable, publish
$env:GH_TOKEN="<token>"
npm run release:publish:verified
```

### Phase 3: QA Matrix Execution (Priority: MEDIUM)

Once installer is uploaded and verified:

1. **Windows 10 QA** ([MILESTONE-4.5-PLAN.md](../planning/MILESTONE-4.5-PLAN.md#windows-10-test-suite))
   - Download installer from GitHub release
   - Execute test cases W10-1 through W10-6
   - Document results in [MILESTONE-4.5-TEST-RESULTS.md](MILESTONE-4.5-TEST-RESULTS.md)

2. **Windows 11 QA**
   - Repeat Windows 10 test suite + compatibility checks

3. **Auto-Update Validation**
   - Install v1.2.3 (if available) or v1.2.0
   - Launch app
   - Help → Check for Updates
   - Verify v1.2.4 is detected and downloaded
   - Restart and confirm upgrade

---

## Fallback Options (If Bloat Fix Infeasible)

### Option A: Segment Large Installer

Split resources into:
- Base installer (~150 MB)
- Resource pack downloaded on first launch

**Pros**: Fits GitHub release asset limits  
**Cons**: Requires app architecture changes

### Option B: Use Alternative Distribution

- **AWS S3 + CloudFront**: Host large installer externally
- **Update `latest.yml`**: Point to S3 URL instead of GitHub
- **Keep GitHub for metadata**: Release notes + checksums only

**Pros**: Removes GitHub size constraints  
**Cons**: Adds infrastructure cost + setup

### Option C: Revert to v1.2.1 Baseline

If v1.2.1 (307 MB) is uploadable:
- Cherry-pick critical v1.2.4 changes onto v1.2.1 codebase
- Release as v1.2.5 with smaller footprint

**Pros**: Quick path to shippable release  
**Cons**: Loses v1.2.4 feature set

---

## Next Steps (Priority Order)

### 🔴 Critical (Complete Today)

1. ✅ [DONE] Document current blocker in status report
2. ⏳ Diagnose installer size bloat (see Phase 1 commands)
3. ⏳ Fix `electron-builder.yml` configuration
4. ⏳ Rebuild installer and verify size (<200 MB)

### 🟡 High (Within 48 Hours)

5. ⏳ Upload corrected installer to v1.2.4 release
6. ⏳ Verify all 3 required assets present via automation
7. ⏳ Execute Windows 10 QA test suite (manual)
8. ⏳ Document QA results in MILESTONE-4.5-TEST-RESULTS.md

### 🟢 Medium (Within 1 Week)

9. ⏳ Execute Windows 11 QA test suite
10. ⏳ macOS builds (if platform available)
11. ⏳ Auto-update end-to-end validation
12. ⏳ Production deployment checklist signoff

---

## Automation Script Locations

- **Release verify script**: [apps/desktop/scripts/release-verify.mjs](../../apps/desktop/scripts/release-verify.mjs)
- **NPM command**: `npm run release:publish:verified`
- **Configuration**: [apps/desktop/electron-builder.yml](../../apps/desktop/electron-builder.yml)
- **Verification reports**: `apps/desktop/dist/installers/release-verification-*.json`

---

## Lessons Learned

1. **Automated size validation needed**: Next iteration should fail builds if installer exceeds threshold (e.g., 250 MB)
2. **Pre-publish dry-run**: Add `--dry-run` mode to verify local artifacts before attempting upload
3. **Incremental testing**: Should have caught 100% size jump in v1.2.1 → v1.2.4
4. **Explicit file filters**: Default `dist/**` is too broad for monorepo structure

---

## Contact / Escalation

**Primary**: Naja Deen (maz7deen@gmail.com)  
**Status**: This report auto-generated; manual intervention required for bloat diagnosis

---

## Appendix A: Command Reference

### Check Local Installer Size

```powershell
Get-Item e:\WABSender\apps\desktop\dist\installers\WABSender-Setup-1.2.4.exe | 
  Format-Table Name,@{N="MB";E={[math]::Round($_.Length/1MB,2)}}
```

### Query GitHub Release Assets

```powershell
$headers=@{ 
  Authorization = "Bearer $env:GH_TOKEN"; 
  Accept='application/vnd.github+json'; 
  'User-Agent'='wabsender-cli'
}
$release = Invoke-RestMethod -Method Get `
  -Uri 'https://api.github.com/repos/Deen7979/WABSender/releases/tags/v1.2.4' `
  -Headers $headers
$release.assets | Select-Object name,size | Format-Table -AutoSize
```

### Manually Run Release Verify

```powershell
cd e:\WABSender\apps\desktop
node scripts/release-verify.mjs --verify-only
# OR
node scripts/release-verify.mjs --publish --max-retries=3
```

---

**END OF REPORT**
