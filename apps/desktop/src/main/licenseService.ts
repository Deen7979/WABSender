/**
 * Desktop License Validation Service
 * 
 * Electron main process service for:
 * - Device fingerprinting
 * - License storage encryption
 * - Heartbeat scheduling
 * - Offline grace period management
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { app } from "electron";
import { machineIdSync } from "node-machine-id";

// Configuration
const LICENSE_DIR = process.env.LICENSE_DIR || path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "WABSender");
const LICENSE_FILE = path.join(LICENSE_DIR, "license.dat");
const ENCRYPTION_KEY = process.env.LICENSE_ENCRYPTION_KEY || "your-encryption-key-change-in-production";
const HEARTBEAT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const OFFLINE_GRACE_PERIOD = 3 * 24 * 60 * 60 * 1000; // 3 days

interface LicenseData {
	activationId: string;
	licenseId: string;
	deviceId: string;
	planCode: string;
	expiresAt: string | null;
	activatedAt: string;
	lastHeartbeat: string;
	accessToken?: string;
	refreshToken?: string;
}

interface DeviceFingerprint {
	machineId: string;
	platform: string;
	arch: string;
	cpus: number;
	hostname: string;
	version: string;
}

/**
 * Generate unique device identifier
 */
export function generateDeviceId(): string {
	try {
		// Use node-machine-id for hardware-based ID
		const machineId = machineIdSync(true);
		return crypto.createHash("sha256").update(machineId).digest("hex").substring(0, 32);
	} catch (error) {
		console.error("Error generating device ID:", error);
		// Fallback to a combination of system properties
		const os = require("os");
		const fallbackId = `${os.platform()}-${os.arch()}-${os.hostname()}-${os.cpus()[0].model}`;
		return crypto.createHash("sha256").update(fallbackId).digest("hex").substring(0, 32);
	}
}

/**
 * Get device fingerprint for activation
 */
export function getDeviceFingerprint(): DeviceFingerprint {
	const os = require("os");
	return {
		machineId: generateDeviceId(),
		platform: os.platform(),
		arch: os.arch(),
		cpus: os.cpus().length,
		hostname: os.hostname(),
		version: app.getVersion()
	};
}

/**
 * Encrypt license data for local storage
 */
function encryptLicenseData(data: LicenseData): string {
	const algorithm = "aes-256-cbc";
	const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
	const iv = crypto.randomBytes(16);

	const cipher = crypto.createCipheriv(algorithm, key, iv);
	let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
	encrypted += cipher.final("hex");

	// Return IV + encrypted data
	return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt license data from local storage
 */
function decryptLicenseData(encryptedData: string): LicenseData | null {
	try {
		const algorithm = "aes-256-cbc";
		const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);

		const [ivHex, encrypted] = encryptedData.split(":");
		const iv = Buffer.from(ivHex, "hex");

		const decipher = crypto.createDecipheriv(algorithm, key, iv);
		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return JSON.parse(decrypted);
	} catch (error) {
		console.error("Error decrypting license data:", error);
		return null;
	}
}

/**
 * Save license data to encrypted file
 */
export async function saveLicenseData(data: LicenseData): Promise<void> {
	try {
		// Ensure directory exists
		await fs.mkdir(LICENSE_DIR, { recursive: true });

		// Encrypt and save
		const encrypted = encryptLicenseData(data);
		await fs.writeFile(LICENSE_FILE, encrypted, "utf8");

		console.log("License data saved successfully");
	} catch (error) {
		console.error("Error saving license data:", error);
		throw new Error("Failed to save license data");
	}
}

/**
 * Load license data from encrypted file
 */
export async function loadLicenseData(): Promise<LicenseData | null> {
	try {
		const encrypted = await fs.readFile(LICENSE_FILE, "utf8");
		return decryptLicenseData(encrypted);
	} catch (error: any) {
		if (error.code === "ENOENT") {
			// File doesn't exist - not activated
			return null;
		}
		console.error("Error loading license data:", error);
		return null;
	}
}

/**
 * Delete license data (deactivation/logout)
 */
export async function deleteLicenseData(): Promise<void> {
	try {
		await fs.unlink(LICENSE_FILE);
		console.log("License data deleted");
	} catch (error: any) {
		if (error.code !== "ENOENT") {
			console.error("Error deleting license data:", error);
		}
	}
}

/**
 * Validate license activation with server
 */
export async function validateLicenseWithServer(
	apiBaseUrl: string,
	accessToken: string,
	deviceId: string
): Promise<{ valid: boolean; reason?: string; data?: any }> {
	try {
		const response = await fetch(`${apiBaseUrl}/subscription/validate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify({ deviceId })
		});

		const data = await response.json();

		if (response.ok && data.activated) {
			return { valid: true, data };
		}

		return {
			valid: false,
			reason: data.reason || "validation_failed"
		};
	} catch (error) {
		console.error("License validation failed:", error);
		return {
			valid: false,
			reason: "network_error"
		};
	}
}

/**
 * Send heartbeat to server
 */
export async function sendHeartbeat(
	apiBaseUrl: string,
	accessToken: string,
	deviceId: string,
	appVersion: string
): Promise<{ success: boolean; valid?: boolean; reason?: string }> {
	try {
		const response = await fetch(`${apiBaseUrl}/subscription/heartbeat`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify({ deviceId, appVersion })
		});

		const data = await response.json();

		if (response.ok && data.valid) {
			return { success: true, valid: true };
		}

		if (response.status === 403) {
			return {
				success: false,
				valid: false,
				reason: data.reason || "forbidden"
			};
		}

		return { success: false, valid: false, reason: "heartbeat_failed" };
	} catch (error) {
		console.error("Heartbeat failed:", error);
		return { success: false, valid: false, reason: "network_error" };
	}
}

/**
 * Check if offline grace period has expired
 */
export function isOfflineGracePeriodExpired(lastHeartbeat: string): boolean {
	const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
	const now = Date.now();
	return now - lastHeartbeatTime > OFFLINE_GRACE_PERIOD;
}

/**
 * Check if license has expired
 */
export function isLicenseExpired(expiresAt: string | null): boolean {
	if (!expiresAt) {
		return false; // No expiry date = perpetual (legacy)
	}
	return new Date(expiresAt) <= new Date();
}

/**
 * Initialize heartbeat scheduler
 */
export function initializeHeartbeatScheduler(
	apiBaseUrl: string,
	getAccessToken: () => Promise<string | null>,
	onHeartbeatFailure: (reason: string) => void
): NodeJS.Timeout {
	const runHeartbeat = async () => {
		try {
			const licenseData = await loadLicenseData();
			if (!licenseData) {
				console.log("No license data found, skipping heartbeat");
				return;
			}

			const accessToken = await getAccessToken();
			if (!accessToken) {
				console.error("No access token available for heartbeat");
				onHeartbeatFailure("no_token");
				return;
			}

			const result = await sendHeartbeat(
				apiBaseUrl,
				accessToken,
				licenseData.deviceId,
				app.getVersion()
			);

			if (result.success && result.valid) {
				// Update last heartbeat timestamp
				licenseData.lastHeartbeat = new Date().toISOString();
				await saveLicenseData(licenseData);
				console.log("Heartbeat successful");
			} else {
				console.error("Heartbeat failed:", result.reason);
				onHeartbeatFailure(result.reason || "unknown");
			}
		} catch (error) {
			console.error("Heartbeat error:", error);
		}
	};

	// Run initial heartbeat after 5 seconds
	setTimeout(runHeartbeat, 5000);

	// Schedule recurring heartbeat
	return setInterval(runHeartbeat, HEARTBEAT_INTERVAL);
}

/**
 * Validate license on app startup
 */
export async function validateLicenseOnStartup(
	apiBaseUrl: string,
	accessToken: string
): Promise<{
	valid: boolean;
	reason?: string;
	needsActivation?: boolean;
	licenseData?: LicenseData;
}> {
	try {
		// Load stored license data
		const licenseData = await loadLicenseData();

		if (!licenseData) {
			return {
				valid: false,
				needsActivation: true,
				reason: "not_activated"
			};
		}

		// Check local expiry
		if (isLicenseExpired(licenseData.expiresAt)) {
			return {
				valid: false,
				reason: "expired",
				licenseData
			};
		}

		// Check offline grace period
		if (isOfflineGracePeriodExpired(licenseData.lastHeartbeat)) {
			// Must validate with server
			const validationResult = await validateLicenseWithServer(
				apiBaseUrl,
				accessToken,
				licenseData.deviceId
			);

			if (!validationResult.valid) {
				return {
					valid: false,
					reason: validationResult.reason,
					licenseData
				};
			}

			// Update heartbeat
			licenseData.lastHeartbeat = new Date().toISOString();
			await saveLicenseData(licenseData);
		}

		return {
			valid: true,
			licenseData
		};
	} catch (error) {
		console.error("License validation error:", error);
		return {
			valid: false,
			reason: "validation_error"
		};
	}
}

/**
 * Lock application UI when license is invalid
 * Returns HTML content to display
 */
export function getLicenseLockScreen(reason: string): string {
	const messages: Record<string, { title: string; message: string }> = {
		expired: {
			title: "License Expired",
			message: "Your subscription has expired. Please contact your administrator to renew."
		},
		revoked: {
			title: "License Revoked",
			message: "Your license has been revoked. Please contact support for assistance."
		},
		not_activated: {
			title: "Activation Required",
			message: "Please activate this device with a valid license key."
		},
		validation_failed: {
			title: "Validation Failed",
			message: "Unable to validate license. Please check your internet connection."
		},
		network_error: {
			title: "Connection Error",
			message: "Cannot connect to license server. Please check your internet connection."
		}
	};

	const content = messages[reason] || {
		title: "License Error",
		message: "There was a problem with your license. Please contact support."
	};

	return `
<!DOCTYPE html>
<html>
<head>
	<title>${content.title}</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			display: flex;
			justify-content: center;
			align-items: center;
			height: 100vh;
			margin: 0;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		}
		.container {
			background: white;
			padding: 40px;
			border-radius: 10px;
			box-shadow: 0 10px 40px rgba(0,0,0,0.2);
			text-align: center;
			max-width: 400px;
		}
		h1 {
			color: #333;
			margin-bottom: 20px;
		}
		p {
			color: #666;
			line-height: 1.6;
		}
		.icon {
			font-size: 48px;
			margin-bottom: 20px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="icon">🔒</div>
		<h1>${content.title}</h1>
		<p>${content.message}</p>
	</div>
</body>
</html>
	`;
}
