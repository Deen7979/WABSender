import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { db } from "../db/index.js";

export type AuthPayload = {
	userId: string;
	orgId: string;
	role: string;
};

declare module "express-serve-static-core" {
	interface Request {
		auth?: AuthPayload;
	}
}

const resolveOrgContext = async (req: Request, payload: AuthPayload): Promise<string | null> => {
	// Regular users always use their orgId from JWT
	if (payload.role !== "super_admin") {
		// Ensure orgId is not empty - JWT should contain valid orgId or it's invalid
		if (!payload.orgId || typeof payload.orgId !== "string" || payload.orgId.trim() === "") {
			return null;
		}
		return payload.orgId;
	}

	// Super admin: resolve context from X-Org-Id header
	const headerOrgId = req.headers["x-org-id"] as string | undefined;
	if (!headerOrgId) {
		return null;
	}

	// Validate the org exists
	const orgResult = await db.query("SELECT id FROM orgs WHERE id = $1", [headerOrgId]);
	if ((orgResult.rowCount ?? 0) === 0) {
		return null;
	}

	return headerOrgId;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
	const header = req.headers.authorization;
	if (!header?.startsWith("Bearer ")) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const token = header.replace("Bearer ", "");
	try {
		const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
		const resolvedOrgId = await resolveOrgContext(req, payload);
		
		// For super_admin users, org context is required (unless it's a platform API endpoint)
		if (payload.role === "super_admin" && !resolvedOrgId) {
			const baseUrl = req.baseUrl || "";
			if (!baseUrl.startsWith("/api/platform")) {
				return res.status(400).json({ error: "org context required" });
			}
		}

		// For regular users, orgId from JWT must be resolved successfully
		if (payload.role !== "super_admin" && !resolvedOrgId) {
			console.error('[Auth] Regular user missing or invalid orgId in JWT', { 
				userId: payload.userId, 
				role: payload.role,
				orgIdInToken: payload.orgId
			});
			return res.status(400).json({ error: "Invalid token: missing valid org context" });
		}

		// Attach auth to request - ensure orgId is never empty string
		req.auth = { 
			userId: payload.userId, 
			orgId: resolvedOrgId!,  // Guaranteed to be non-empty at this point
			role: payload.role 
		};

		return next();
	} catch (err) {
		console.error('[Auth] Token verification failed', { error: err instanceof Error ? err.message : String(err) });
		return res.status(401).json({ error: "Invalid token" });
	}
};

export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
	if (!req.auth) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	if (req.auth.role !== "super_admin") {
		return res.status(403).json({ error: "Super admin access required" });
	}

	return next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
	if (!req.auth) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	if (req.auth.role !== "admin" && req.auth.role !== "super_admin") {
		return res.status(403).json({ error: "Admin access required" });
	}

	return next();
};
