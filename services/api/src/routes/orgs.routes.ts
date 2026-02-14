import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";

export const orgsRouter = Router();

orgsRouter.get("/me", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const result = await db.query("SELECT id, name FROM orgs WHERE id = $1", [orgId]);
	if (result.rowCount === 0) {
		return res.status(404).json({ error: "Organization not found" });
	}
	return res.json({ orgId: result.rows[0].id, name: result.rows[0].name });
});
