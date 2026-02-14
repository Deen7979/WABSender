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
	if (payload.role !== "super_admin") {
		return payload.orgId || null;
	}

	const headerOrgId = req.headers["x-org-id"] as string | undefined;
	if (!headerOrgId) {
		return null;
	}

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
		req.auth = { ...payload, orgId: resolvedOrgId || "" };

		if (payload.role === "super_admin" && !resolvedOrgId) {
			const baseUrl = req.baseUrl || "";
			if (!baseUrl.startsWith("/api/platform")) {
				return res.status(400).json({ error: "org context required" });
			}
		}

		if (payload.role !== "super_admin" && !resolvedOrgId) {
			return res.status(401).json({ error: "Invalid token" });
		}

		return next();
	} catch {
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
