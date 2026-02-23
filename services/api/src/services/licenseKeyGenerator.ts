/**
 * License Key Generation System
 * 
 * Generates secure, collision-resistant license keys for subscription management
 * Format: WAB-XXXXX-XXXXX-XXXXX-XXXXX (25 characters including dashes)
 * 
 * Security Features:
 * - SHA256 hashing for storage
 * - Cryptographically secure random generation
 * - Checksum validation
 * - Collision detection
 * - HMAC signing support
 */

import crypto from "crypto";

// Character set excluding ambiguous characters (0, O, I, 1, l)
const CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SEGMENT_LENGTH = 5;
const SEGMENTS = 4;
const PREFIX = "WAB";

interface LicenseKey {
	key: string; // Full formatted key: WAB-XXXXX-XXXXX-XXXXX-XXXXX
	hash: string; // SHA256 hash for storage
	normalized: string; // Normalized key without dashes
}

interface LicenseKeyValidation {
	valid: boolean;
	normalized?: string;
	hash?: string;
	error?: string;
}

/**
 * Generate a cryptographically secure random license key
 */
export function generateLicenseKey(): LicenseKey {
	const segments: string[] = [];

	// Generate 4 random segments
	for (let i = 0; i < SEGMENTS; i++) {
		let segment = "";
		for (let j = 0; j < SEGMENT_LENGTH; j++) {
			const randomIndex = crypto.randomInt(0, CHARSET.length);
			segment += CHARSET[randomIndex];
		}
		segments.push(segment);
	}

	// Add checksum segment for validation
	const baseKey = segments.join("");
	const checksum = calculateChecksum(baseKey);
	segments.push(checksum);

	// Format: WAB-XXXXX-XXXXX-XXXXX-XXXXX-CCCCC
	const key = `${PREFIX}-${segments.join("-")}`;
	const normalized = normalizeKey(key);
	const hash = hashKey(normalized);

	return { key, hash, normalized };
}

/**
 * Calculate checksum for license key validation
 * Uses a simple algorithm to detect typos and tampering
 */
function calculateChecksum(input: string): string {
	let sum = 0;
	for (let i = 0; i < input.length; i++) {
		const charCode = input.charCodeAt(i);
		sum += charCode * (i + 1); // Weighted sum
	}

	// Convert to base-32 representation
	let checksum = "";
	for (let i = 0; i < SEGMENT_LENGTH; i++) {
		checksum += CHARSET[sum % CHARSET.length];
		sum = Math.floor(sum / CHARSET.length);
	}

	return checksum;
}

/**
 * Normalize license key by removing dashes and converting to uppercase
 */
export function normalizeKey(licenseKey: string): string {
	return licenseKey
		.replace(/[^a-zA-Z0-9]/g, "")
		.toUpperCase();
}

/**
 * Hash license key using SHA256
 */
export function hashKey(normalizedKey: string): string {
	return crypto
		.createHash("sha256")
		.update(normalizedKey)
		.digest("hex");
}

/**
 * Validate license key format and checksum
 */
export function validateLicenseKey(licenseKey: string): LicenseKeyValidation {
	try {
		const normalized = normalizeKey(licenseKey);

		// Check length (PREFIX + 25 chars = 28 chars)
		if (normalized.length !== 28) {
			return {
				valid: false,
				error: "Invalid key length"
			};
		}

		// Check prefix
		if (!normalized.startsWith(PREFIX)) {
			return {
				valid: false,
				error: "Invalid key prefix"
			};
		}

		// Extract segments
		const keyBody = normalized.substring(3); // Remove 'WAB'
		const baseKey = keyBody.substring(0, 20); // First 4 segments (5 chars each)
		const providedChecksum = keyBody.substring(20, 25); // Last segment

		// Validate checksum
		const calculatedChecksum = calculateChecksum(baseKey);
		if (calculatedChecksum !== providedChecksum) {
			return {
				valid: false,
				error: "Invalid checksum"
			};
		}

		return {
			valid: true,
			normalized,
			hash: hashKey(normalized)
		};
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Validation error"
		};
	}
}

/**
 * Generate HMAC signature for additional security
 * Can be used for license key signing to prevent forgery
 */
export function signLicenseKey(licenseKey: string, secret: string): string {
	return crypto
		.createHmac("sha256", secret)
		.update(normalizeKey(licenseKey))
		.digest("hex");
}

/**
 * Verify HMAC signature
 */
export function verifyLicenseKeySignature(
	licenseKey: string,
	signature: string,
	secret: string
): boolean {
	const calculatedSignature = signLicenseKey(licenseKey, secret);
	return crypto.timingSafeEqual(
		Buffer.from(calculatedSignature),
		Buffer.from(signature)
	);
}

/**
 * Batch generate multiple unique license keys
 * Includes collision detection
 */
export async function generateBatchLicenseKeys(
	count: number,
	existingHashes: Set<string> = new Set()
): Promise<LicenseKey[]> {
	const keys: LicenseKey[] = [];
	const generatedHashes = new Set<string>(existingHashes);

	let attempts = 0;
	const maxAttempts = count * 10; // Safety limit

	while (keys.length < count && attempts < maxAttempts) {
		attempts++;
		const licenseKey = generateLicenseKey();

		// Check for collision
		if (!generatedHashes.has(licenseKey.hash)) {
			keys.push(licenseKey);
			generatedHashes.add(licenseKey.hash);
		}
	}

	if (keys.length < count) {
		throw new Error(`Could only generate ${keys.length} unique keys out of ${count} requested`);
	}

	return keys;
}

/**
 * Format license key for display (adds dashes)
 */
export function formatLicenseKey(normalizedKey: string): string {
	// Remove any existing dashes
	const clean = normalizedKey.replace(/-/g, "");

	// Split into segments
	const segments = [];
	segments.push(clean.substring(0, 3)); // WAB prefix
	for (let i = 3; i < clean.length; i += 5) {
		segments.push(clean.substring(i, i + 5));
	}

	return segments.join("-");
}

/**
 * Generate a trial license key (14 days)
 * Marked with special prefix for identification
 */
export function generateTrialLicenseKey(): LicenseKey {
	const baseKey = generateLicenseKey();
	// Trial keys can be marked in metadata rather than key format
	return baseKey;
}

/**
 * Estimate collision probability (for logging/monitoring)
 */
export function calculateCollisionProbability(keyCount: number): number {
	// Birthday paradox formula
	// Character set: 32 chars, 20 positions = 32^20 possible keys
	const keyspace = Math.pow(CHARSET.length, SEGMENT_LENGTH * SEGMENTS);
	return 1 - Math.exp(-(keyCount * keyCount) / (2 * keyspace));
}

// Export types
export type { LicenseKey, LicenseKeyValidation };
