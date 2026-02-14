# WhatsApp Cloud Desktop App

Scaffold created. Phase 1 implementation will start with auth, contacts import, templates sync, and single-send pipeline.

---

## Desktop Development & Building

### Prerequisites

- **Node.js**: 18+ (with npm)
- **Electron**: 29+ (installed via npm)
- **TypeScript**: 5.9+
- **Vite**: 5.4+
- **Python 3**: Required by electron-builder (for Windows)

### Quick Start — Development Mode

```bash
cd apps/desktop

# Install dependencies
npm install

# Start dev server (Renderer process)
npm run dev:renderer

# In another terminal, start Electron main process
npm run dev:main

# OR run both concurrently
npm run dev
```

**Dev server runs on**: `http://localhost:5173`  
**Electron window loads**: Dev server URL with hot module replacement (HMR)  
**DevTools**: Ctrl+Shift+I (Windows) or Cmd+Option+I (macOS)

### Build — Production Release

```bash
cd apps/desktop

# Build renderer (Vite) + main (TypeScript)
npm run build

# Output structure:
# dist/renderer/   — bundled React app (index.html, .js, .css)
# dist/main/       — compiled Electron main process
```

---

## Installers & Packaging

### Platform Support

| Platform | Installer | Architecture | Signing |
|----------|-----------|--------------|---------|
| Windows | NSIS (.exe) | x64 | Code signing (optional) |
| macOS | DMG + ZIP | Intel (x64) | Notarization (required) |
| macOS | DMG + ZIP | Apple Silicon (arm64) | Notarization (required) |

### Building Installers

```bash
cd apps/desktop

# Create installers (no publish, no signing)
npm run dist

# Output: dist/installers/
#   - WAB Sender Setup <version>.exe (Windows NSIS)
#   - WAB Sender-<version>.dmg (macOS Intel DMG)
#   - WAB Sender-<version>.zip (macOS Intel ZIP)
#   - WAB Sender-<version>-arm64.dmg (macOS Apple Silicon DMG)
#   - WAB Sender-<version>-arm64.zip (macOS Apple Silicon ZIP)
```

---

## Code Signing & Security

### Windows Code Signing

**Objective**: Sign Windows installer with code certificate (optional but recommended)

**Setup**:
1. Obtain code signing certificate (.pfx file) from certificate authority
2. Set environment variables:

```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your-password
```

**Build signed installer**:
```bash
cd apps/desktop
npm run dist
# Installer is now signed and trusted by Windows
```

**Verification** (after build):
```powershell
Get-AuthenticodeSignature "path\to\WAB Sender Setup.exe"
# Status should be "Valid"
```

### macOS Code Signing & Notarization

**Objective**: Sign and notarize macOS app for Gatekeeper acceptance

**Prerequisites**:
1. Apple Developer Program account (paid)
2. Team ID and Developer certificate
3. App-specific password (not account password)

**Setup app-specific password**:
1. Visit https://appleid.apple.com/ → Security
2. Click "Generate password" under "App-specific passwords"
3. Name it "WAB Sender" and save the generated password

**Environment variables**:
```bash
export APPLE_ID=your-apple-id@example.com
export APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx  # App-specific password
export APPLE_TEAM_ID=ABC123DEFG               # From https://developer.apple.com/account
```

**Build notarized installers**:
```bash
cd apps/desktop
npm run dist
# Build automatically triggers notarization (see scripts/notarize.js)
# Notarization usually completes in 5-15 minutes
```

**Verify notarization** (after build):
```bash
spctl -a -v /Applications/WAB\ Sender.app
# Status should be: "accepted source=Notarized Developer ID"

codesign -dv /Applications/WAB\ Sender.app
# Shows code signature and Team ID
```

**macOS Entitlements**:
- Hardened runtime enabled
- JIT and unsigned memory allowed (for Electron)
- Library validation disabled (for dynamic dependencies)
- See: [scripts/entitlements.mac.plist](apps/desktop/scripts/entitlements.mac.plist)

---

## Auto-Update Publishing

For the detailed, step-by-step update workflow (including versioning, release tagging, and verification), see [docs/AUTO-UPDATE.md](docs/AUTO-UPDATE.md).

### GitHub Release Publishing

**Objective**: Publish installers as GitHub releases for auto-update delivery

**Prerequisites**:
1. GitHub repository (public or private)
2. Personal access token with `repo` scope
3. Installers built successfully (via `npm run build` + `npm run dist`)
4. Repository configured in [apps/desktop/electron-builder.yml](apps/desktop/electron-builder.yml)

**Setup GitHub token**:
1. Visit https://github.com/settings/tokens
2. Create "Personal Access Token (classic)"
3. Scopes: Select `repo` (all)
4. Save token securely

**Publish installers to GitHub releases**:
```bash
cd apps/desktop

# Build
npm run build

# Publish to GitHub releases
GH_TOKEN=ghp_your-token-here npm run dist:publish

# Output:
#   Uploads all installers to GitHub releases
#   Creates release tag matching package.json version
#   Publishes as "Latest Release"
```

**GitHub release contents** (auto-detected by electron-updater):
```
Release: v0.1.0
├── WAB Sender Setup 0.1.0.exe (Windows)
├── WAB Sender-0.1.0.dmg (macOS Intel)
├── WAB Sender-0.1.0.zip (macOS Intel)
├── WAB Sender-0.1.0-arm64.dmg (macOS Apple Silicon)
└── WAB Sender-0.1.0-arm64.zip (macOS Apple Silicon)
```

**Auto-updater flow**:
1. App checks GitHub releases on launch
2. Detects new version if available
3. Downloads installer in background
4. Prompts user: "Restart to apply update?"
5. On restart, extracts and installs update
6. App relaunches with new version

**Security note**:
- For seamless updates on Windows, sign the installer with a trusted certificate (see Code Signing & Security above).
- Unsigned builds are acceptable for testing, but SmartScreen will show "Unknown Publisher" warnings.

**Manual update check**:
- User can click Help > Check for Updates anytime
- Shows "Checking...", then "Available" or "Latest version"

---

## Full Build & Publish Workflow

### Complete Release Pipeline

```bash
cd apps/desktop

# 1. Update version in package.json
#    "version": "0.1.1"

# 2. Build application
npm run build

# 3. Create and publish signed installers
CSC_LINK=/path/to/cert.pfx \
CSC_KEY_PASSWORD=password \
APPLE_ID=user@example.com \
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx \
APPLE_TEAM_ID=ABC123DEFG \
GH_TOKEN=ghp_token \
npm run dist:publish

# Expected output:
#   ✓ Windows NSIS signed and published
#   ✓ macOS Intel notarized and published
#   ✓ macOS Apple Silicon notarized and published
#   ✓ GitHub releases created with all assets
#   ✓ Auto-updater configured and active
```

### What Each Script Does

| Script | Purpose | Output |
|--------|---------|--------|
| `npm run build` | Compile Vite + TypeScript | `dist/renderer/` + `dist/main/` |
| `npm run dist` | Create installers (unsigned) | `dist/installers/` |
| `npm run dist:publish` | Create + publish to GitHub | GitHub releases |
| `npm run dev` | Run dev server + main (concurrent) | Electron window @ localhost:5173 |

---

## Testing & Validation

### Platform Testing Checklist

Before releasing, test on target platforms:

**Windows**:
- [ ] Windows 10 (Build 19044+) installation
- [ ] Windows 11 installation
- [ ] Installer is code-signed (if CSC_LINK set)
- [ ] App launches and loads correctly
- [ ] Help > Check for Updates works

**macOS**:
- [ ] Intel Mac installation (from DMG)
- [ ] Apple Silicon Mac installation (native, no Rosetta)
- [ ] Gatekeeper accepts notarized app (no "Unidentified Developer" warning)
- [ ] App launches and loads correctly
- [ ] Help > Check for Updates works

**Auto-update**:
- [ ] v0.1.0 installed and detects v0.1.1 available
- [ ] Update downloads successfully
- [ ] App prompts to restart
- [ ] After restart, v0.1.1 running and UI loads

For detailed testing procedures, see: [MILESTONE-4.4-TESTING.md](docs/MILESTONE-4.4-TESTING.md)

---

## Environment Variables Reference

All environment variables used for building, signing, and publishing:

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` | No (dev) |
| `VITE_DEV_SERVER_URL` | Dev server URL | `http://localhost:5173` | No (dev) |
| `CSC_LINK` | Windows code signing cert | `/path/to/cert.pfx` | Windows signing only |
| `CSC_KEY_PASSWORD` | Windows cert password | `password` | Windows signing only |
| `APPLE_ID` | Apple Developer ID | `user@example.com` | macOS signing only |
| `APPLE_ID_PASSWORD` | Apple app-specific password | `xxxx-xxxx-xxxx-xxxx` | macOS signing only |
| `APPLE_TEAM_ID` | Apple Team ID | `ABC123DEFG` | macOS signing only |
| `GH_TOKEN` | GitHub release token | `ghp_token...` | Publishing only |

For detailed variable information, see: [ENVIRONMENT-VARIABLES.md](docs/ENVIRONMENT-VARIABLES.md)

---

## Troubleshooting

### Build Issues

**Problem**: `npm run build` fails with "Cannot find module..."
- **Solution**: Run `npm install` in `apps/desktop/` and `services/api/`
- **Verify**: `npm list electron vite typescript`

**Problem**: TypeScript compilation errors
- **Solution**: Check `tsconfig.json` and `tsconfig.node.json` are correct
- **Verify**: `npx tsc --noEmit` (check errors without building)

### Signing Issues

**Windows**:
- **"CSC_LINK is invalid"**: Check file path and certificate format (must be .pfx)
- **"Certificate password incorrect"**: Verify CSC_KEY_PASSWORD matches cert password

**macOS**:
- **"Notarization failed"**: Verify APPLE_ID is team admin, app-specific password is correct, APPLE_TEAM_ID matches developer account
- **"Gatekeeper rejects app"**: Re-notarize with correct credentials (notarization status takes 5-15 min)

### Update Issues

**"Update check shows 404"**:
- **Solution**: Verify GitHub release exists with correct version tag
- **Check**: `GH_TOKEN` has read access to releases
- **Verify**: Release contains installers for current platform

**"Auto-update not triggering"**:
- **Solution**: Auto-updates only work in packaged builds (not dev mode)
- **Verify**: Built and installed via `npm run dist`, not `npm run dev`

---

## Security Practices

1. **Never commit secrets** to version control
2. **Store credentials** in CI/CD secrets (GitHub Actions, etc.)
3. **Use app-specific passwords** for Apple ID (not account password)
4. **Rotate tokens** annually after personnel changes
5. **Restrict token scopes** to minimum required permissions
6. **Audit release logs** for unauthorized publishes

---

## Next Steps

1. **Development**: Run `npm run dev` to start local development
2. **Testing**: Create test installers with `npm run dist` on each platform
3. **Signing**: Set up code signing certificates (Windows) and Apple Developer account (macOS)
4. **Publishing**: Configure GitHub token and publish releases with `npm run dist:publish`
5. **Validation**: Test installations and auto-update flow on target platforms

See [MILESTONE-4.4-TESTING.md](docs/MILESTONE-4.4-TESTING.md) for comprehensive testing procedures.

