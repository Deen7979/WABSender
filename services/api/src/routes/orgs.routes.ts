import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { auditMiddleware, AuditAction, ResourceType } from "../middleware/auditLog.js";

export const orgsRouter = Router();

orgsRouter.get("/me", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	
	if (!orgId) {
		console.error('[Orgs] Missing orgId in /me endpoint', { auth: req.auth });
		return res.status(400).json({ error: "Invalid org context" });
	}
	
	const result = await db.query("SELECT id, name FROM orgs WHERE id = $1", [orgId]);
	if (result.rowCount === 0) {
		return res.status(404).json({ error: "Organization not found" });
	}
	return res.json({ orgId: result.rows[0].id, name: result.rows[0].name });
});

// POST /orgs - Create new org (super_admin only)
orgsRouter.post("/", requireSuperAdmin, auditMiddleware(AuditAction.ORG_CREATED, ResourceType.ORG), async (req, res) => {
	try {
		const { name } = req.body;

		if (!name) {
			return res.status(400).json({ error: 'name required' });
		}

		const result = await db.query(
			'INSERT INTO orgs (name) VALUES ($1) RETURNING id, name, created_at',
			[name]
		);

		res.status(201).json(result.rows[0]);
	} catch (error: any) {
		console.error('[Orgs] Error creating org:', error);
		res.status(500).json({ error: 'Failed to create organization' });
	}
});

// GET /orgs - List all orgs (super_admin only)
orgsRouter.get("/", requireSuperAdmin, async (req, res) => {
	try {
		const result = await db.query(
			'SELECT id, name, created_at FROM orgs ORDER BY created_at DESC'
		);

		res.json(result.rows);
	} catch (error: any) {
		console.error('[Orgs] Error fetching orgs:', error);
		res.status(500).json({ error: 'Failed to fetch organizations' });
	}
});
