import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { config } from "../config/index.js";
import { logAudit, AuditAction } from "../middleware/auditLog.js";

export const authRouter = Router();

const createTokens = (payload: { userId: string; orgId: string; role: string }) => {
	const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: "1h" });
	const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: "30d" });
	return { accessToken, refreshToken };
};

authRouter.post("/login", async (req, res) => {
	const { email, password } = req.body as { email?: string; password?: string };
	if (!email || !password) {
		return res.status(400).json({ error: "Email and password required" });
	}

	const result = await db.query(
		"SELECT id, org_id, role, password_hash FROM users WHERE email = $1 AND is_active = true",
		[email]
	);

	if (result.rowCount === 0) {
		return res.status(401).json({ error: "Invalid credentials" });
	}

	const user = result.rows[0];
	const matches = await bcrypt.compare(password, user.password_hash);
	if (!matches) {
		// Log failed login attempt
		await logAudit({
			orgId: user.org_id,
			userId: user.id,
			action: AuditAction.AUTH_FAILED,
			metadata: { email, reason: 'invalid_password' },
			ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress,
			userAgent: req.headers['user-agent'],
		});
		return res.status(401).json({ error: "Invalid credentials" });
	}

	// Validate user has an organization assigned
	const orgId = user.org_id as string | null;
	if (!orgId) {
		console.error('[Auth] User has no org assigned', { userId: user.id, email });
		return res.status(400).json({ error: "User account not properly configured - missing organization" });
	}

	const tokens = createTokens({ userId: user.id, orgId, role: user.role });
	
	// Log successful login
	await logAudit({
		orgId: user.org_id,
		userId: user.id,
		action: AuditAction.AUTH_LOGIN,
		metadata: { email },
		ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress,
		userAgent: req.headers['user-agent'],
	});
	
	return res.json(tokens);
});

authRouter.post("/register", async (req, res) => {
	const { orgName, email, password } = req.body as {
		orgName?: string;
		email?: string;
		password?: string;
	};

	if (!orgName || !email || !password) {
		return res.status(400).json({ error: "orgName, email, and password required" });
	}

	const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [email]);
	if (existingUser.rowCount && existingUser.rowCount > 0) {
		return res.status(409).json({ error: "Email already registered" });
	}

	const orgResult = await db.query(
		"INSERT INTO orgs (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id",
		[orgName]
	);

	if (orgResult.rowCount === 0) {
		return res.status(409).json({ error: "Organization already exists" });
	}

	const orgId = orgResult.rows[0].id as string;
	const passwordHash = await bcrypt.hash(password, 10);

	const userResult = await db.query(
		"INSERT INTO users (org_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id",
		[orgId, email, passwordHash]
	);

	const userId = userResult.rows[0].id as string;
	const tokens = createTokens({ userId, orgId, role: "admin" });

	await logAudit({
		orgId,
		userId,
		action: "auth.register",
		metadata: { email, orgName },
		ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress,
		userAgent: req.headers["user-agent"],
	});

	return res.status(201).json(tokens);
});

authRouter.post("/refresh", async (req, res) => {
	const { refreshToken } = req.body as { refreshToken?: string };
	if (!refreshToken) {
		return res.status(400).json({ error: "Refresh token required" });
	}

	try {
		const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as {
			userId: string;
			orgId: string;
			role: string;
		};

		const tokens = createTokens(payload);
		return res.json(tokens);
	} catch {
		return res.status(401).json({ error: "Invalid refresh token" });
	}
});
