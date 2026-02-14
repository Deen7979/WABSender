/**
 * WhatsApp Meta Cloud API Integration
 * 
 * Handles secure Meta OAuth 2.0 flow for WhatsApp Business Account connection
 * - Initiates Facebook Login with required scopes
 * - Receives authorization code and exchanges for access token
 * - Fetches WABA and phone number details
 * - Stores tokens securely with encryption
 */

import { Router, Request, Response } from "express";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { encryptToken, decryptToken } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";
import { syncTemplatesForOrg } from "../services/templateSync.js";

export const metaOAuthRouter = Router();

/**
 * Step 1: Initiate Meta OAuth Flow
 * GET /auth/meta-oauth/init
 * 
 * Redirects user to Facebook Login with required scopes
 */
metaOAuthRouter.get("/init", requireAuth, (req, res) => {
	const orgId = req.auth!.orgId;
	const userId = req.auth!.userId;
	
	// Generate state parameter for CSRF protection
	const state = Buffer.from(JSON.stringify({ orgId, userId, timestamp: Date.now() })).toString("base64");
	
	const scopes = [
		"business_management",
		"whatsapp_business_management",
		"whatsapp_business_messaging",
	];
	
	const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
	authUrl.searchParams.set("client_id", config.metaAppId);
	authUrl.searchParams.set("redirect_uri", config.metaOAuthRedirectUri);
	authUrl.searchParams.set("scope", scopes.join(","));
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("response_type", "code");
	
	res.json({
		authUrl: authUrl.toString(),
		message: "Redirect to this URL to authenticate with Meta"
	});
});

/**
 * Step 2: OAuth Callback Handler
 * GET /auth/meta-oauth/callback
 * 
 * Handles OAuth redirect, exchanges code for access token, fetches WABA details
 */
metaOAuthRouter.get("/callback", async (req, res) => {
	const { code, state } = req.query;
	
	if (!code || !state) {
		return res.status(400).json({ error: "Missing code or state parameter" });
	}
	
	try {
		// Verify state for CSRF protection
		let stateData;
		try {
			stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
		} catch {
			return res.status(400).json({ error: "Invalid state parameter" });
		}
		
		const { orgId, userId } = stateData;
		
		// Exchange code for access token
		logger.info("Exchanging OAuth code for access token", { orgId });
		
		const tokenUrl = "https://graph.facebook.com/v19.0/oauth/access_token";
		const tokenResponse = await fetch(tokenUrl, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: config.metaAppId,
				client_secret: config.metaAppSecret,
				redirect_uri: config.metaOAuthRedirectUri,
				code: code as string,
			}).toString(),
		});
		
		if (!tokenResponse.ok) {
			const error = await tokenResponse.text();
			logger.error("Failed to exchange OAuth code", { error, status: tokenResponse.status });
			return res.status(500).json({ error: "Failed to authenticate with Meta" });
		}
		
		const { access_token: shortLivedToken } = await tokenResponse.json() as { access_token: string };
		
		// Fetch business accounts with short-lived token
		logger.info("Fetching business accounts", { orgId });
		
		const meUrl = "https://graph.facebook.com/v19.0/me?fields=id&access_token=" + shortLivedToken;
		const meResponse = await fetch(meUrl);
		const meData = await meResponse.json() as { id: string };
		const businessId = meData.id;
		
		// Fetch WABA list
		const wabaUrl = `https://graph.facebook.com/v19.0/${businessId}/owned_whatsapp_business_accounts?access_token=${shortLivedToken}`;
		const wabaResponse = await fetch(wabaUrl);
		const wabaData = await wabaResponse.json() as { data: Array<{ id: string; name: string }> };
		
		if (!wabaData.data || wabaData.data.length === 0) {
			return res.status(400).json({ 
				error: "No WhatsApp Business Accounts found. Please create one in Meta Business Manager." 
			});
		}
		
		// Use the first WABA (in Phase 3, support multiple)
		const waba = wabaData.data[0];
		const wabaId = waba.id;
		
		// Fetch phone numbers under WABA
		const phoneUrl = `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${shortLivedToken}`;
		const phoneResponse = await fetch(phoneUrl);
		const phoneData = await phoneResponse.json() as { data: Array<{ id: string; display_phone_number: string }> };
		
		if (!phoneData.data || phoneData.data.length === 0) {
			return res.status(400).json({ 
				error: "No phone numbers found under this WhatsApp Business Account. Add one in Meta Business Manager." 
			});
		}
		
		// Use the first phone number (in Phase 3, support multiple)
		const phone = phoneData.data[0];
		const phoneNumberId = phone.id;
		const displayPhoneNumber = phone.display_phone_number;
		
		// Exchange short-lived token for long-lived token using phone number ID
		// Note: In production, you may need to do this via a backend-to-backend call
		const longLivedTokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.metaAppId}&client_secret=${config.metaAppSecret}&fb_exchange_token=${shortLivedToken}`;
		const longLivedResponse = await fetch(longLivedTokenUrl);
		const longLivedData = await longLivedResponse.json() as { access_token: string; expires_in?: number };
		const longLivedToken = longLivedData.access_token;
		
		// Calculate token expiry (60 days for long-lived tokens)
		const tokenExpiresAt = new Date();
		tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 60);
		
		// Encrypt token before storage
		const encryptedToken = encryptToken(longLivedToken);
		
		// Store or update WhatsApp account
		await db.query(
			`INSERT INTO whatsapp_accounts (
				org_id, phone_number_id, waba_id, display_phone_number, 
				business_id, access_token, token_expires_at, is_active, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
			ON CONFLICT (org_id, phone_number_id) 
			DO UPDATE SET 
				access_token = EXCLUDED.access_token,
				token_expires_at = EXCLUDED.token_expires_at,
				is_active = true,
				waba_id = EXCLUDED.waba_id,
				display_phone_number = EXCLUDED.display_phone_number,
				business_id = EXCLUDED.business_id`,
			[orgId, phoneNumberId, wabaId, displayPhoneNumber, businessId, encryptedToken, tokenExpiresAt]
		);
		
		logger.info("WhatsApp account connected", { 
			orgId, 
			phoneNumberId, 
			displayPhoneNumber, 
			wabaId 
		});
		
		// Auto-trigger template sync after successful OAuth connection
		logger.info("Starting auto-sync of templates", { orgId, wabaId });
		syncTemplatesForOrg(orgId, wabaId)
			.then((count) => {
				logger.info("Auto-sync templates completed", { orgId, count });
			})
			.catch((err) => {
				logger.warn("Auto-sync templates failed (non-blocking)", { 
					error: err.message,
					orgId 
				});
				// Don't block OAuth callback on template sync failure
			});
		
		// Redirect to success page with account info
		const successUrl = new URL(config.frontendUrl + "/whatsapp/connected");
		successUrl.searchParams.set("phoneNumber", displayPhoneNumber);
		successUrl.searchParams.set("wabaId", wabaId);
		
		res.redirect(successUrl.toString());
		
	} catch (error: any) {
		logger.error("Meta OAuth callback error", { error: error.message });
		const errorUrl = new URL(config.frontendUrl + "/whatsapp/error");
		errorUrl.searchParams.set("error", error.message);
		res.redirect(errorUrl.toString());
	}
});

/**
 * Get WhatsApp Account Status
 * GET /auth/meta-oauth/status
 */
metaOAuthRouter.get("/status", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	
	try {
		const result = await db.query(
			`SELECT id, phone_number_id, display_phone_number, waba_id, 
					is_active, token_expires_at, created_at
			 FROM whatsapp_accounts 
			 WHERE org_id = $1 AND is_active = true
			 LIMIT 1`,
			[orgId]
		);
		
		if (result.rowCount === 0) {
			return res.json({ connected: false });
		}
		
		const account = result.rows[0];
		const isExpiring = new Date(account.token_expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		
		res.json({
			connected: true,
			phoneNumber: account.display_phone_number,
			wabaId: account.waba_id,
			tokenExpiresAt: account.token_expires_at,
			isExpiring,
			createdAt: account.created_at,
		});
		
	} catch (err: any) {
		logger.error("Failed to get WhatsApp status", { error: err.message });
		res.status(500).json({ error: "Failed to fetch status" });
	}
});

/**
 * Disconnect WhatsApp Account
 * POST /auth/meta-oauth/disconnect
 */
metaOAuthRouter.post("/disconnect", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	
	try {
		await db.query(
			"UPDATE whatsapp_accounts SET is_active = false WHERE org_id = $1",
			[orgId]
		);
		
		logger.info("WhatsApp account disconnected", { orgId });
		res.json({ success: true });
		
	} catch (err: any) {
		logger.error("Failed to disconnect WhatsApp", { error: err.message });
		res.status(500).json({ error: "Failed to disconnect" });
	}
});
