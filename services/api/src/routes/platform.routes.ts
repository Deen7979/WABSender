import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

export const platformRouter = Router();

platformRouter.get("/orgs", requireAuth, requireSuperAdmin, async (_req, res) => {
	const result = await db.query(
		`SELECT
			o.id,
			o.name,
			o.created_at,
			(SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id) AS user_count,
			(SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id AND u.role = 'admin') AS admin_count
		FROM orgs o
		ORDER BY o.created_at DESC`
	);
	return res.json({ orgs: result.rows });
});

platformRouter.get("/users", requireAuth, requireSuperAdmin, async (_req, res) => {
	const result = await db.query(
		`SELECT
			u.id,
			u.email,
			u.role,
			u.is_active,
			u.created_at,
			u.org_id,
			o.name AS org_name
		FROM users u
		LEFT JOIN orgs o ON o.id = u.org_id
		ORDER BY u.created_at DESC`
	);
	return res.json({ users: result.rows });
});

platformRouter.get("/licenses", requireAuth, requireSuperAdmin, async (_req, res) => {
	const result = await db.query(
		`SELECT
			l.id,
			l.status,
			l.plan_code,
			l.max_devices,
			l.expires_at,
			l.issued_to_org_id,
			l.created_at,
			l.updated_at,
			o.name AS org_name,
			(SELECT COUNT(*)::int FROM license_activations la WHERE la.license_id = l.id AND la.deactivated_at IS NULL) AS active_devices,
			(SELECT COUNT(*)::int FROM license_activations la WHERE la.license_id = l.id) AS total_activations
		FROM licenses l
		LEFT JOIN orgs o ON o.id = l.issued_to_org_id
		ORDER BY l.created_at DESC`
	);
	return res.json({ licenses: result.rows });
});
