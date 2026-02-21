/**
 * License Token Management Service
 * 
 * Handles JWT tokens for license validation:
 * - Access tokens (24 hours)
 * - Refresh tokens (7 days)
 * - Token revocation and blacklisting
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";

// Token configuration
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || "your-access-token-secret";
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || "your-refresh-token-secret";
const ACCESS_TOKEN_EXPIRY = "24h";
const REFRESH_TOKEN_EXPIRY = "7d";

interface TokenPayload {
	userId: string;
	orgId: string;
	deviceId: string;
	activationId: string;
	licenseId: string;
	type: "access" | "refresh";
}

interface TokenPair {
	accessToken: string;
	refreshToken: string;
	accessExpiresAt: Date;
	refreshExpiresAt: Date;
}

/**
 * Generate access and refresh token pair for license activation
 */
export async function generateLicenseTokens(params: {
	userId: string;
	orgId: string;
	deviceId: string;
	activationId: string;
	licenseId: string;
}): Promise<TokenPair> {
	const { userId, orgId, deviceId, activationId, licenseId } = params;

	// Generate access token (24 hours)
	const accessPayload: TokenPayload = {
		userId,
		orgId,
		deviceId,
		activationId,
		licenseId,
		type: "access"
	};

	const accessToken = jwt.sign(accessPayload, ACCESS_TOKEN_SECRET, {
		expiresIn: ACCESS_TOKEN_EXPIRY,
		issuer: "wabsender-license",
		subject: activationId
	});

	// Generate refresh token (7 days)
	const refreshPayload: TokenPayload = {
		userId,
		orgId,
		deviceId,
		activationId,
		licenseId,
		type: "refresh"
	};

	const refreshToken = jwt.sign(refreshPayload, REFRESH_TOKEN_SECRET, {
		expiresIn: REFRESH_TOKEN_EXPIRY,
		issuer: "wabsender-license",
		subject: activationId
	});

	// Store refresh token in database
	const refreshTokenHash = hashToken(refreshToken);
	const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	try {
		await db.query(
			`INSERT INTO license_refresh_tokens 
			 (activation_id, token_hash, device_id, org_id, expires_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			[activationId, refreshTokenHash, deviceId, orgId, refreshExpiresAt]
		);
	} catch (error) {
		logger.error("Error storing refresh token:", error);
		throw new Error("Failed to generate tokens");
	}

	const accessExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

	return {
		accessToken,
		refreshToken,
		accessExpiresAt,
		refreshExpiresAt
	};
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): TokenPayload | null {
	try {
		const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET, {
			issuer: "wabsender-license"
		}) as TokenPayload;

		if (decoded.type !== "access") {
			return null;
		}

		return decoded;
	} catch (error) {
		logger.debug("Access token verification failed:", error);
		return null;
	}
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshToken(token: string): TokenPayload | null {
	try {
		const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET, {
			issuer: "wabsender-license"
		}) as TokenPayload;

		if (decoded.type !== "refresh") {
			return null;
		}

		return decoded;
	} catch (error) {
		logger.debug("Refresh token verification failed:", error);
		return null;
	}
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
	accessToken: string;
	accessExpiresAt: Date;
} | null> {
	// Verify refresh token
	const decoded = verifyRefreshToken(refreshToken);
	if (!decoded) {
		return null;
	}

	// Check if refresh token exists and is not revoked
	const tokenHash = hashToken(refreshToken);
	const result = await db.query(
		`SELECT id, revoked_at, expires_at 
		 FROM license_refresh_tokens 
		 WHERE token_hash = $1`,
		[tokenHash]
	);

	if (result.rowCount === 0) {
		logger.warn("Refresh token not found in database", { activationId: decoded.activationId });
		return null;
	}

	const tokenRecord = result.rows[0];

	if (tokenRecord.revoked_at) {
		logger.warn("Attempted use of revoked refresh token", {
			activationId: decoded.activationId
		});
		return null;
	}

	if (new Date(tokenRecord.expires_at) <= new Date()) {
		logger.warn("Refresh token expired", { activationId: decoded.activationId });
		return null;
	}

	// Check license status
	const licenseResult = await db.query(
		`SELECT l.status, l.expires_at 
		 FROM licenses l
		 JOIN license_activations la ON la.license_id = l.id
		 WHERE la.id = $1`,
		[decoded.activationId]
	);

	if (licenseResult.rowCount === 0) {
		logger.warn("License not found for activation", { activationId: decoded.activationId });
		return null;
	}

	const license = licenseResult.rows[0];

	if (license.status !== "active") {
		logger.warn("License not active", {
			activationId: decoded.activationId,
			status: license.status
		});
		return null;
	}

	if (license.expires_at && new Date(license.expires_at) <= new Date()) {
		logger.warn("License expired", { activationId: decoded.activationId });
		return null;
	}

	// Generate new access token
	const accessPayload: TokenPayload = {
		userId: decoded.userId,
		orgId: decoded.orgId,
		deviceId: decoded.deviceId,
		activationId: decoded.activationId,
		licenseId: decoded.licenseId,
		type: "access"
	};

	const accessToken = jwt.sign(accessPayload, ACCESS_TOKEN_SECRET, {
		expiresIn: ACCESS_TOKEN_EXPIRY,
		issuer: "wabsender-license",
		subject: decoded.activationId
	});

	const accessExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

	// Update last_used_at
	await db.query(
		"UPDATE license_refresh_tokens SET last_used_at = now() WHERE id = $1",
		[tokenRecord.id]
	);

	return {
		accessToken,
		accessExpiresAt
	};
}

/**
 * Revoke refresh token (e.g., on logout or license revocation)
 */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
	const tokenHash = hashToken(refreshToken);

	try {
		const result = await db.query(
			`UPDATE license_refresh_tokens 
			 SET revoked_at = now() 
			 WHERE token_hash = $1 AND revoked_at IS NULL`,
			[tokenHash]
		);

		return result.rowCount! > 0;
	} catch (error) {
		logger.error("Error revoking refresh token:", error);
		return false;
	}
}

/**
 * Revoke all refresh tokens for an activation
 */
export async function revokeActivationTokens(activationId: string): Promise<number> {
	try {
		const result = await db.query(
			`UPDATE license_refresh_tokens 
			 SET revoked_at = now() 
			 WHERE activation_id = $1 AND revoked_at IS NULL`,
			[activationId]
		);

		return result.rowCount || 0;
	} catch (error) {
		logger.error("Error revoking activation tokens:", error);
		return 0;
	}
}

/**
 * Revoke all refresh tokens for a license
 */
export async function revokeLicenseTokens(licenseId: string): Promise<number> {
	try {
		const result = await db.query(
			`UPDATE license_refresh_tokens 
			 SET revoked_at = now() 
			 WHERE activation_id IN (
			   SELECT id FROM license_activations WHERE license_id = $1
			 ) AND revoked_at IS NULL`,
			[licenseId]
		);

		return result.rowCount || 0;
	} catch (error) {
		logger.error("Error revoking license tokens:", error);
		return 0;
	}
}

/**
 * Clean up expired refresh tokens (run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
	try {
		const result = await db.query(
			`DELETE FROM license_refresh_tokens 
			 WHERE expires_at < now() - INTERVAL '30 days'`
		);

		const deletedCount = result.rowCount || 0;
		if (deletedCount > 0) {
			logger.info(`Cleaned up ${deletedCount} expired refresh tokens`);
		}

		return deletedCount;
	} catch (error) {
		logger.error("Error cleaning up expired tokens:", error);
		return 0;
	}
}

/**
 * Hash token for storage (SHA256)
 */
function hashToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Middleware: Validate license token
 */
export function validateLicenseToken(req: any, res: any, next: any) {
	const authHeader = req.headers.authorization;

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return res.status(401).json({ error: "Authorization token required" });
	}

	const token = authHeader.substring(7);
	const decoded = verifyAccessToken(token);

	if (!decoded) {
		return res.status(401).json({ error: "Invalid or expired token" });
	}

	// Attach decoded token to request
	req.licenseAuth = decoded;
	next();
}
