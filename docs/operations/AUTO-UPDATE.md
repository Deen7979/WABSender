# Auto-Update Workflow (Windows)

This document describes the production-ready update workflow for the WABSender desktop app (Windows), using `electron-updater` and GitHub Releases.

## 1) Configuration Summary

**Update stack**:
- `electron-updater` in the main process
- `electron-builder` with `publish` settings
- GitHub Releases as the update server

**Key files**:
- [apps/desktop/src/main/updater.ts](../apps/desktop/src/main/updater.ts)
- [apps/desktop/electron-builder.yml](../apps/desktop/electron-builder.yml)
- [apps/desktop/package.json](../apps/desktop/package.json)

**Current release channel**:
- Regular releases only (no prereleases)

## 2) Versioning Rules (SemVer)

1. Update the desktop app version in [apps/desktop/package.json](../apps/desktop/package.json).
2. Use semantic versioning (MAJOR.MINOR.PATCH):
   - MAJOR: breaking changes
   - MINOR: new features, backward compatible
   - PATCH: bug fixes

## 3) Release Build + Publish (Windows)

### Prerequisites

- Windows code signing certificate (recommended)
- GitHub Personal Access Token (classic) with `repo` scope

### Build and Publish

```bash
cd apps/desktop

# Install dependencies if needed
npm install

# Build renderer + main
npm run build

# Publish installers to GitHub Releases
# (Add CSC_* env vars if you have a signing cert)
CSC_LINK=/path/to/cert.pfx \
CSC_KEY_PASSWORD=your-password \
GH_TOKEN=ghp_your-token-here \
npm run dist:publish

# Unsigned testing release (SmartScreen will show "Unknown Publisher")
GH_TOKEN=ghp_your-token-here \
npm run dist:publish
```

### Expected GitHub Release Assets

Electron Builder will upload:
- `WABSender-Setup-<version>.exe`
- `latest.yml`
- `WABSender-Setup-<version>.exe.blockmap`

These assets are required by `electron-updater` for Windows updates.

## 4) Auto-Update Behavior (Windows)

On app start (packaged builds only):
1. Checks GitHub Releases for the latest version
2. Downloads updates in the background if available
3. Shows a dialog when the update is ready
4. Restarts and installs on user confirmation

A manual check is also available via Help > Check for Updates.

## 5) Security and Integrity

**Windows code signing** is strongly recommended:
- Ensures integrity and user trust
- Avoids SmartScreen warnings
- Supports seamless updates

If you sign the installer, the update package inherits trust and the auto-updater can verify integrity.

For testing and early releases, unsigned builds are acceptable. Expect SmartScreen to warn users with "Unknown Publisher" until a trusted certificate is used.

## 6) Release Checklist (Step-by-Step)

1. Update version in [apps/desktop/package.json](../apps/desktop/package.json).
2. Run tests and validate the app locally.
3. Build installers and publish:
   - `npm run dist:publish`
4. Verify the GitHub Release:
   - Release is not a draft
   - Assets include `latest.yml` and `*.blockmap`
5. Install the current release and launch the app.
6. Publish a newer version and confirm:
   - Update is detected on launch
   - Download happens in the background
   - User is prompted to restart
   - App restarts on the new version

## 7) Troubleshooting

- **Update not detected**: ensure the GitHub release is published (not draft), and the version number increased.
- **Download fails**: verify `latest.yml` and blockmap assets exist on the release.
- **Signer issues**: confirm `CSC_LINK` and `CSC_KEY_PASSWORD` are correct and valid.

## 8) Notes for CI/CD (Optional)

If using CI, set `GH_TOKEN` and `CSC_*` environment variables in the pipeline secrets.
