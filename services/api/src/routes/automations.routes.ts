import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { broadcastToOrg } from "../websocket/hub.js";
import { auditMiddleware, AuditAction, ResourceType } from "../middleware/auditLog.js";

export const automationsRouter = Router();

// GET /automations - List all automation rules for org
automationsRouter.get("/", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;

	try {
		const result = await db.query(
			`SELECT id, name, description, trigger_type, trigger_config, action_type, action_config,
					priority, is_active, created_at, updated_at
			 FROM automation_rules
			 WHERE org_id = $1
			 ORDER BY priority ASC, created_at DESC`,
			[orgId]
		);

		return res.json(result.rows);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// GET /automations/:id - Get single automation rule
automationsRouter.get("/:id", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const ruleId = req.params.id;

	try {
		const result = await db.query(
			`SELECT id, name, description, trigger_type, trigger_config, action_type, action_config,
					priority, is_active, created_at, updated_at
			 FROM automation_rules
			 WHERE id = $1 AND org_id = $2`,
			[ruleId, orgId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Automation rule not found" });
		}

		return res.json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /automations - Create new automation rule
automationsRouter.post("/", requireAuth, auditMiddleware(AuditAction.AUTOMATION_CREATED, ResourceType.AUTOMATION), async (req, res) => {
	const orgId = req.auth!.orgId;
	const {
		name,
		description,
		trigger_type,
		trigger_config,
		action_type,
		action_config,
		priority,
	} = req.body as {
		name: string;
		description?: string;
		trigger_type: string;
		trigger_config: Record<string, any>;
		action_type: string;
		action_config: Record<string, any>;
		priority?: number;
	};

	if (!name || !trigger_type || !trigger_config || !action_type || !action_config) {
		return res.status(400).json({ error: "Missing required fields" });
	}

	try {
		const result = await db.query(
			`INSERT INTO automation_rules (
				org_id, name, description, trigger_type, trigger_config,
				action_type, action_config, priority, is_active
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
			RETURNING id, name, description, trigger_type, trigger_config,
				action_type, action_config, priority, is_active, created_at, updated_at`,
			[
				orgId,
				name,
				description || null,
				trigger_type,
				JSON.stringify(trigger_config),
				action_type,
				JSON.stringify(action_config),
				priority || 100,
			]
		);

		return res.status(201).json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// PUT /automations/:id - Update automation rule
automationsRouter.put("/:id", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const ruleId = req.params.id;
	const {
		name,
		description,
		trigger_type,
		trigger_config,
		action_type,
		action_config,
		priority,
	} = req.body as {
		name?: string;
		description?: string;
		trigger_type?: string;
		trigger_config?: Record<string, any>;
		action_type?: string;
		action_config?: Record<string, any>;
		priority?: number;
	};

	try {
		// Build update query dynamically
		const updates: string[] = [];
		const values: any[] = [orgId, ruleId];

		if (name !== undefined) {
			updates.push("name = $" + (values.length + 1));
			values.push(name);
		}
		if (description !== undefined) {
			updates.push("description = $" + (values.length + 1));
			values.push(description);
		}
		if (trigger_type !== undefined) {
			updates.push("trigger_type = $" + (values.length + 1));
			values.push(trigger_type);
		}
		if (trigger_config !== undefined) {
			updates.push("trigger_config = $" + (values.length + 1));
			values.push(JSON.stringify(trigger_config));
		}
		if (action_type !== undefined) {
			updates.push("action_type = $" + (values.length + 1));
			values.push(action_type);
		}
		if (action_config !== undefined) {
			updates.push("action_config = $" + (values.length + 1));
			values.push(JSON.stringify(action_config));
		}
		if (priority !== undefined) {
			updates.push("priority = $" + (values.length + 1));
			values.push(priority);
		}

		if (updates.length === 0) {
			return res.status(400).json({ error: "No fields to update" });
		}

		updates.push("updated_at = NOW()");

		const result = await db.query(
			`UPDATE automation_rules
			 SET ${updates.join(", ")}
			 WHERE id = $2 AND org_id = $1
			 RETURNING id, name, description, trigger_type, trigger_config,
				action_type, action_config, priority, is_active, created_at, updated_at`,
			values
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Automation rule not found" });
		}

		return res.json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// DELETE /automations/:id - Delete automation rule
automationsRouter.delete("/:id", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const ruleId = req.params.id;

	try {
		const result = await db.query(
			"DELETE FROM automation_rules WHERE id = $1 AND org_id = $2",
			[ruleId, orgId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Automation rule not found" });
		}

		return res.json({ deleted: true });
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /automations/:id/toggle - Toggle automation rule active status
automationsRouter.post("/:id/toggle", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const ruleId = req.params.id;

	try {
		const result = await db.query(
			`UPDATE automation_rules
			 SET is_active = NOT is_active, updated_at = NOW()
			 WHERE id = $1 AND org_id = $2
			 RETURNING id, is_active`,
			[ruleId, orgId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Automation rule not found" });
		}

		broadcastToOrg(orgId, "automation:toggled", result.rows[0]);

		return res.json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});
