# Environment Variables Reference

This document lists all environment variables required for building, signing, notarizing, and publishing WAB Sender across platforms.

---

## Development Environment Variables

These variables are used during local development and testing.

### Frontend (Renderer Process)

**`VITE_API_URL`** (Optional)
- **Purpose**: Base URL for API client requests
- **Default**: `http://localhost:3000`
- **Example**: `http://localhost:3000` or `https://api.example.com`
- **Used in**: `CampaignReports.tsx`, `InboxAnalytics.tsx`, API client
- **Note**: Vite auto-replaces at build time via `import.meta.env.VITE_API_URL`

**`VITE_DEV_SERVER_URL`** (Optional)
- **Purpose**: Dev server URL for hot module replacement (HMR)
- **Default**: `http://localhost:5173`
- **Example**: `http://localhost:5173` or `http://192.168.1.100:5173`
- **Used in**: `src/main/window.ts` (preload URL in dev mode)
- **Note**: Set automatically by Vite dev server

### Backend (Main Process)

**`NODE_ENV`** (Optional)
- **Purpose**: Execution environment mode
- **Values**: `development`, `production`
- **Default**: `production` (when packaged), `development` (in dev mode)
- **Used in**: TypeScript compilation, menu visibility (DevTools toggle)

**`VITE_DEV_SERVER_URL`** (Optional)
- **Purpose**: Points main process to dev server URL (development only)
- **Example**: `http://localhost:5173`
- **Used in**: `src/main/window.ts` for loading dev server

---

## Code Signing Variables

### Windows Code Signing

**`CSC_LINK`** (Required for signed installers)
- **Purpose**: Path to code signing certificate
- **Format**: File path or Base64-encoded certificate
- **Example**: `/path/to/certificate.pfx` or `base64-encoded-cert`
- **Source**: Obtain from certificate provider or internal PKI
- **Note**: If not set, NSIS installer is generated unsigned (still installable but triggers security warnings)

**`CSC_KEY_PASSWORD`** (Required with CSC_LINK)
- **Purpose**: Password to unlock code signing certificate
- **Example**: `my-secure-password`
- **Security**: Never commit to version control; use CI/CD secrets
- **Note**: Leave empty if certificate has no password

### macOS Code Signing & Notarization

**`APPLE_ID`** (Required for notarization)
- **Purpose**: Apple ID email for Developer Account
- **Example**: `developer@example.com`
- **Source**: Apple Developer Program account
- **Note**: Must be team admin or have notarization permissions

**`APPLE_ID_PASSWORD`** (Required for notarization)
- **Purpose**: App-specific password for Apple ID (not account password)
- **Generation**: Visit https://appleid.apple.com/ > Security > App-specific passwords
- **Example**: `xxxx-xxxx-xxxx-xxxx`
- **Security**: Never use account password; use app-specific password only
- **Note**: Different from regular Apple ID password

**`APPLE_TEAM_ID`** (Required for notarization)
- **Purpose**: Developer Team ID for code signing
- **Example**: `ABC123DEFG`
- **Source**: Apple Developer Program > Membership > Team ID
- **Note**: Visible on https://developer.apple.com/account/#/membership

### macOS Development

**`DEVELOPER_DIR`** (Optional)
- **Purpose**: Override Xcode version for code signing
- **Example**: `/Applications/Xcode.app/Contents/Developer`
- **Note**: Only needed if multiple Xcode versions are installed

---

## Publishing Variables

### GitHub Publishing

**`GH_TOKEN`** (Required for GitHub release publishing)
- **Purpose**: GitHub personal access token for publishing releases
- **Generation**: GitHub > Settings > Developer Settings > Personal Access Tokens > Tokens (classic)
- **Permissions Required**:
  - `repo` (all)
  - `workflow` (if using GitHub Actions)
- **Example**: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Scope**: Public or private (matching repository visibility)
- **Security**: Treat as secret; never commit to version control
- **Used in**: `npm run dist:publish` command
- **Expiration**: Set to no expiration or 1 year+

---

## Build Configuration Variables

### Package.json Scripts

These variables are set via command line before running npm scripts:

```bash
# Development build
npm run dev

# Production build
npm run build

# Create installers (no publish)
npm run dist

# Create and publish installers
GH_TOKEN=xxxx npm run dist:publish

# Code signing (Windows)
CSC_LINK=/path/to/cert.pfx CSC_KEY_PASSWORD=password npm run dist

# Notarization (macOS)
APPLE_ID=user@example.com \
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx \
APPLE_TEAM_ID=ABC123DEFG \
npm run dist

# Combined (all platforms with signing)
CSC_LINK=/path/to/cert.pfx \
CSC_KEY_PASSWORD=password \
APPLE_ID=user@example.com \
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx \
APPLE_TEAM_ID=ABC123DEFG \
GH_TOKEN=ghp_xxxx \
npm run dist:publish
```

---

## Environment Variable Setup Guide

### 1. Local Development (.env file)

Create `.env.local` in `apps/desktop/`:

```bash
# .env.local (do not commit)
VITE_API_URL=http://localhost:3000
VITE_DEV_SERVER_URL=http://localhost:5173
NODE_ENV=development
```

Load automatically by Vite during development.

### 2. CI/CD Pipeline (GitHub Actions)

**Example workflow**:

```yaml
name: Build and Publish

env:
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: GH_TOKEN=$GH_TOKEN npm run dist:publish
```

### 3. Local Command Line (Temporary Override)

For testing or one-off builds:

```bash
cd apps/desktop

# Override for single build
CSC_LINK=$HOME/certs/cert.pfx \
CSC_KEY_PASSWORD=password \
npm run dist
```

---

## Validation Checklist

Before building for release:

- [ ] `VITE_API_URL` points to correct backend API
- [ ] `CSC_LINK` and `CSC_KEY_PASSWORD` are set (Windows code signing)
- [ ] `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID` are set (macOS notarization)
- [ ] `GH_TOKEN` has correct permissions (GitHub release publishing)
- [ ] All secrets are in CI/CD system (not in repo)
- [ ] Environment variables are not logged or exposed in output

---

## Troubleshooting

### "CSC_LINK is invalid"
1. Check file path: `file <path-to-cert>`
2. Verify certificate is in PFX format: `file cert.pfx` should say "data"
3. Test password: `openssl pkcs12 -info -in cert.pfx -passin pass:password`

### "Notarization failed: Invalid credentials"
1. Verify app-specific password (not account password)
2. Check Team ID is correct: `security find-identity -v -p codesigning`
3. Ensure Apple ID is team admin

### "GH_TOKEN permissions insufficient"
1. Regenerate token with `repo` and `workflow` scopes
2. Check token has not expired: Visit https://github.com/settings/tokens
3. Verify token is for correct repository (not organization level)

### "Update check fails with 404"
1. Verify GitHub release exists for current version
2. Check GH_TOKEN has read access to releases
3. Ensure `package.json` version matches GitHub release tag

---

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use CI/CD secrets** for GitHub Actions, GitLab CI, etc.
3. **Rotate tokens** annually or after personnel changes
4. **Use app-specific passwords** for Apple ID (not account password)
5. **Restrict token scopes** to minimum required permissions
6. **Audit token usage** in CI/CD logs (mask secrets in output)
7. **Use environment-specific values** (dev, staging, production)

---

## Reference Links

- [Electron Builder Environment Variables](https://www.electron.build/configuration/publish#github-api-authentication)
- [Apple Developer Notarization](https://developer.apple.com/documentation/notaryapi/)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Code Signing on Windows](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
