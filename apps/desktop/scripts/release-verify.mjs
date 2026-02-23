import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');
const installersDir = path.join(desktopRoot, 'dist', 'installers');

const argv = process.argv.slice(2);
const shouldPublish = argv.includes('--publish');
const verifyOnly = argv.includes('--verify-only') || !shouldPublish;
const maxRetriesArg = argv.find((arg) => arg.startsWith('--max-retries='));
const maxRetries = maxRetriesArg ? Number(maxRetriesArg.split('=')[1]) : 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function readDesktopPackage() {
  const packagePath = path.join(desktopRoot, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function parseRepo(pkg) {
  const fallback = { owner: 'Deen7979', repo: 'WABSender' };
  const repoUrl = pkg?.repository?.url;
  if (!repoUrl || typeof repoUrl !== 'string') return fallback;

  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/i);
  if (!match) return fallback;

  return { owner: match[1], repo: match[2] };
}

function collectInstallers() {
  if (!fs.existsSync(installersDir)) {
    return [];
  }

  const allowedExtensions = new Set([
    '.exe',
    '.dmg',
    '.zip',
    '.yml',
    '.blockmap',
    '.appimage'
  ]);

  return fs
    .readdirSync(installersDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(installersDir, entry.name);
      const ext = path.extname(entry.name).toLowerCase();
      return { name: entry.name, ext, filePath };
    })
    .filter((entry) => allowedExtensions.has(entry.ext))
    .filter((entry) => entry.name !== 'builder-effective-config.yaml')
    .map((entry) => {
      const buffer = fs.readFileSync(entry.filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const stats = fs.statSync(entry.filePath);
      return {
        name: entry.name,
        sizeBytes: stats.size,
        sha256: hash
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function selectExpectedAssetsForVersion(localArtifacts, version) {
  const expectedNames = new Set([
    `WABSender-Setup-${version}.exe`,
    `WABSender-Setup-${version}.exe.blockmap`,
    'latest.yml'
  ]);

  return localArtifacts.filter((artifact) => expectedNames.has(artifact.name));
}

async function uploadReleaseAsset({ owner, repo, releaseId, token, artifact }) {
  const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(artifact.name)}`;
  const bytes = fs.readFileSync(path.join(installersDir, artifact.name));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'wabsender-release-verify',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length)
    },
    body: bytes
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to upload asset ${artifact.name} (${response.status}): ${body}`);
  }

  return response.json();
}

async function withRetry(task, retries = 3, delayMs = 1500) {
  let lastError;
  for (let i = 1; i <= retries; i += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (i < retries) {
        await sleep(delayMs * i);
      }
    }
  }
  throw lastError;
}

function cleanupTransientInstallerFiles() {
  if (!fs.existsSync(installersDir)) {
    return;
  }

  const transientMatchers = [
    /^__uninstaller-nsis-.*\.exe$/i,
    /^.*\.nsis\.7z$/i,
    /^.*\.nsis\.zip$/i
  ];

  for (const entry of fs.readdirSync(installersDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const shouldDelete = transientMatchers.some((regex) => regex.test(entry.name));
    if (!shouldDelete) continue;

    const filePath = path.join(installersDir, entry.name);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Best effort cleanup; retry path handles remaining transient locks
    }
  }
}

async function fetchReleaseByTag({ owner, repo, tag, token }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'wabsender-release-verify'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub release lookup failed (${response.status}): ${body}`);
  }

  return response.json();
}

function summarizeMissingAssets(localArtifacts, remoteAssets) {
  const remoteNames = new Set(remoteAssets.map((asset) => asset.name));
  return localArtifacts
    .map((artifact) => artifact.name)
    .filter((name) => !remoteNames.has(name));
}

function writeReport(version, report) {
  if (!fs.existsSync(installersDir)) {
    fs.mkdirSync(installersDir, { recursive: true });
  }
  const reportPath = path.join(installersDir, `release-verification-${version}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function verifyGithubRelease({ owner, repo, version, token, localArtifacts }) {
  const tag = `v${version}`;
  const release = await fetchReleaseByTag({ owner, repo, tag, token });
  const missingAssets = summarizeMissingAssets(localArtifacts, release.assets || []);

  return {
    tag,
    releaseId: release.id,
    releaseName: release.name,
    htmlUrl: release.html_url,
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
    publishedAt: release.published_at,
    remoteAssets: (release.assets || []).map((asset) => ({
      name: asset.name,
      sizeBytes: asset.size,
      downloadUrl: asset.browser_download_url
    })),
    missingAssets,
    assetMatch: missingAssets.length === 0
  };
}

async function main() {
  const pkg = readDesktopPackage();
  const version = pkg.version;
  const repo = parseRepo(pkg);
  const token = process.env.GH_TOKEN;

  console.log(`\n[release-verify] Desktop version: ${version}`);
  console.log(`[release-verify] Repo: ${repo.owner}/${repo.repo}`);
  console.log(`[release-verify] Mode: ${shouldPublish ? 'publish+verify' : 'verify-only'}\n`);

  console.log('[release-verify] Building app...');
  run('npm', ['run', 'build']);

  if (verifyOnly) {
    console.log('[release-verify] Generating local installer artifacts...');
    run('npx', ['electron-builder', '--publish', 'never']);

    const localArtifacts = collectInstallers();
    if (localArtifacts.length === 0) {
      throw new Error('No installer artifacts found in dist/installers.');
    }

    const report = {
      timestamp: new Date().toISOString(),
      mode: 'verify-only',
      version,
      repo,
      localArtifacts
    };
    const reportPath = writeReport(version, report);
    console.log(`[release-verify] Local verification report written: ${reportPath}`);
    return;
  }

  if (!token) {
    throw new Error('GH_TOKEN is required for publish+verify mode.');
  }

  const attempts = [];
  let localArtifacts = [];
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    cleanupTransientInstallerFiles();
    await sleep(1200);

    console.log(`\n[release-verify] Publish attempt ${attempt}/${maxRetries}...`);
    let publishError = null;
    try {
      run('npx', ['electron-builder', '--publish', 'always']);
    } catch (error) {
      publishError = error;
    }

    localArtifacts = collectInstallers();
    const expectedAssets = selectExpectedAssetsForVersion(localArtifacts, version);

    if (expectedAssets.length === 0) {
      attempts.push({
        attempt,
        at: new Date().toISOString(),
        publishError: 'No expected release assets found for current version'
      });
      console.warn('[release-verify] No expected versioned assets found after publish attempt.');
      continue;
    }

    if (publishError) {
      attempts.push({
        attempt,
        at: new Date().toISOString(),
        publishError: String(publishError.message || publishError)
      });

      console.warn(`[release-verify] Publish failed on attempt ${attempt}: ${publishError.message}`);
      continue;
    }

    console.log('[release-verify] Verifying GitHub release assets...');
    let verification;
    try {
      verification = await withRetry(() => verifyGithubRelease({
        owner: repo.owner,
        repo: repo.repo,
        version,
        token,
        localArtifacts: expectedAssets
      }));
    } catch (error) {
      attempts.push({
        attempt,
        at: new Date().toISOString(),
        verificationError: String(error.message || error)
      });
      console.warn(`[release-verify] Verification failed on attempt ${attempt}: ${error.message}`);
      continue;
    }

    if (!verification.assetMatch && verification.missingAssets.length > 0) {
      console.log('[release-verify] Uploading missing assets directly to existing release...');
      try {
        for (const missingName of verification.missingAssets) {
          const artifact = expectedAssets.find((item) => item.name === missingName);
          if (!artifact) continue;
          await withRetry(() => uploadReleaseAsset({
            owner: repo.owner,
            repo: repo.repo,
            releaseId: verification.releaseId,
            token,
            artifact
          }), 3, 2000);
        }

        verification = await withRetry(() => verifyGithubRelease({
          owner: repo.owner,
          repo: repo.repo,
          version,
          token,
          localArtifacts: expectedAssets
        }));
      } catch (error) {
        attempts.push({
          attempt,
          at: new Date().toISOString(),
          uploadOrVerifyError: String(error.message || error)
        });
        console.warn(`[release-verify] Missing-asset upload/verification failed on attempt ${attempt}: ${error.message}`);
        continue;
      }
    }

    attempts.push({
      attempt,
      at: new Date().toISOString(),
      verification
    });

    if (verification.assetMatch) {
      const report = {
        timestamp: new Date().toISOString(),
        mode: 'publish+verify',
        success: true,
        version,
        repo,
        localArtifacts: expectedAssets,
        attempts
      };
      const reportPath = writeReport(version, report);
      console.log(`[release-verify] SUCCESS: all expected assets are present on ${verification.tag}`);
      console.log(`[release-verify] Release URL: ${verification.htmlUrl}`);
      console.log(`[release-verify] Report: ${reportPath}`);
      return;
    }

    console.warn(`[release-verify] Missing assets after attempt ${attempt}:`);
    verification.missingAssets.forEach((asset) => console.warn(`  - ${asset}`));
  }

  const report = {
    timestamp: new Date().toISOString(),
    mode: 'publish+verify',
    success: false,
    version,
    repo,
    localArtifacts,
    attempts
  };
  const reportPath = writeReport(version, report);
  throw new Error(`Release verification failed after ${maxRetries} attempts. See report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`\n[release-verify] ERROR: ${error.message}`);
  process.exit(1);
});
