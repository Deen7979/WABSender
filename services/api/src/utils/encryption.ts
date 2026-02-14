/**
 * Token Encryption Utility
 * 
 * Encrypts sensitive Meta API tokens before storing in database
 * Uses AES-256-GCM for authenticated encryption with associated data (AEAD)
 */

import crypto from "crypto";
import { config } from "../config/index.js";

/**
 * Encrypts a token using AES-256-GCM
 * Returns a JSON string containing: encrypted data, IV, and auth tag
 */
export function encryptToken(token: string): string {
	if (!config.encryptionKey) {
		throw new Error("ENCRYPTION_KEY not configured");
	}
	
	// Use the first 32 bytes of the encryption key (256-bit for AES-256)
	const key = Buffer.from(config.encryptionKey).slice(0, 32);
	
	// Generate a random 16-byte IV
	const iv = crypto.randomBytes(16);
	
	// Create cipher
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	
	// Encrypt the token
	const encrypted = Buffer.concat([
		cipher.update(token, "utf8"),
		cipher.final(),
	]);
	
	// Get authentication tag
	const authTag = cipher.getAuthTag();
	
	// Return as base64-encoded JSON for database storage
	return JSON.stringify({
		iv: iv.toString("base64"),
		data: encrypted.toString("base64"),
		tag: authTag.toString("base64"),
	});
}

/**
 * Decrypts a token encrypted with encryptToken()
 */
export function decryptToken(encryptedData: string): string {
	if (!config.encryptionKey) {
		throw new Error("ENCRYPTION_KEY not configured");
	}
	
	const key = Buffer.from(config.encryptionKey).slice(0, 32);
	
	// Parse the JSON
	const { iv: ivBase64, data: dataBase64, tag: tagBase64 } = JSON.parse(encryptedData);
	
	// Convert from base64
	const iv = Buffer.from(ivBase64, "base64");
	const encrypted = Buffer.from(dataBase64, "base64");
	const authTag = Buffer.from(tagBase64, "base64");
	
	// Create decipher
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(authTag);
	
	// Decrypt the token
	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final(),
	]);
	
	return decrypted.toString("utf8");
}
