import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";

export const businessHoursRouter = Router();

// GET /business-hours - List business hours for org
businessHoursRouter.get("/", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;

	try {
		const result = await db.query(
			`SELECT id, timezone, day_of_week, start_time, end_time, created_at
			 FROM business_hours
			 WHERE org_id = $1
			 ORDER BY day_of_week ASC, start_time ASC`,
			[orgId]
		);

		return res.json(result.rows);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// GET /business-hours/is-open - Check if currently within business hours
businessHoursRouter.get("/is-open", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const timezone = (req.query.timezone as string) || "UTC";

	try {
		// Get org's business hours
		const result = await db.query(
			`SELECT day_of_week, start_time, end_time
			 FROM business_hours
			 WHERE org_id = $1
			 ORDER BY day_of_week ASC`,
			[orgId]
		);

		if (result.rowCount === 0) {
			// No business hours configured = always open
			return res.json({ isOpen: true, message: "No business hours configured" });
		}

		// Get current time in org's timezone
		const now = new Date().toLocaleString("en-US", { timeZone: timezone });
		const currentDate = new Date(now);
		const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
		const currentTime = `${String(currentDate.getHours()).padStart(2, "0")}:${String(
			currentDate.getMinutes()
		).padStart(2, "0")}:00`;

		// Check if current day/time falls within business hours
		const matching = result.rows.find(
			(row: any) => row.day_of_week === dayOfWeek && row.start_time <= currentTime && currentTime < row.end_time
		);

		return res.json({
			isOpen: !!matching,
			currentDayOfWeek: dayOfWeek,
			currentTime,
			timezone,
		});
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// POST /business-hours - Create business hours entry
businessHoursRouter.post("/", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const { timezone, day_of_week, start_time, end_time } = req.body as {
		timezone: string;
		day_of_week: number;
		start_time: string;
		end_time: string;
	};

	if (timezone === undefined || day_of_week === undefined || !start_time || !end_time) {
		return res.status(400).json({ error: "Missing required fields" });
	}

	if (day_of_week < 0 || day_of_week > 6) {
		return res.status(400).json({ error: "day_of_week must be 0-6 (Sunday-Saturday)" });
	}

	try {
		const result = await db.query(
			`INSERT INTO business_hours (org_id, timezone, day_of_week, start_time, end_time)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (org_id, day_of_week) DO UPDATE
			 SET timezone = EXCLUDED.timezone, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time
			 RETURNING id, timezone, day_of_week, start_time, end_time, created_at`,
			[orgId, timezone, day_of_week, start_time, end_time]
		);

		return res.status(201).json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// PUT /business-hours/:dayOfWeek - Update business hours for a specific day
businessHoursRouter.put("/:dayOfWeek", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const dayOfWeek = parseInt(req.params.dayOfWeek);
	const { timezone, start_time, end_time } = req.body as {
		timezone?: string;
		start_time?: string;
		end_time?: string;
	};

	if (dayOfWeek < 0 || dayOfWeek > 6) {
		return res.status(400).json({ error: "dayOfWeek must be 0-6 (Sunday-Saturday)" });
	}

	try {
		// Build update query
		const updates: string[] = [];
		const values: any[] = [orgId, dayOfWeek];

		if (timezone !== undefined) {
			updates.push("timezone = $" + (values.length + 1));
			values.push(timezone);
		}
		if (start_time !== undefined) {
			updates.push("start_time = $" + (values.length + 1));
			values.push(start_time);
		}
		if (end_time !== undefined) {
			updates.push("end_time = $" + (values.length + 1));
			values.push(end_time);
		}

		if (updates.length === 0) {
			return res.status(400).json({ error: "No fields to update" });
		}

		const result = await db.query(
			`UPDATE business_hours
			 SET ${updates.join(", ")}
			 WHERE org_id = $1 AND day_of_week = $2
			 RETURNING id, timezone, day_of_week, start_time, end_time, created_at`,
			values
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Business hours entry not found for this day" });
		}

		return res.json(result.rows[0]);
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});

// DELETE /business-hours/:dayOfWeek - Delete business hours for a specific day
businessHoursRouter.delete("/:dayOfWeek", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const dayOfWeek = parseInt(req.params.dayOfWeek);

	if (dayOfWeek < 0 || dayOfWeek > 6) {
		return res.status(400).json({ error: "dayOfWeek must be 0-6 (Sunday-Saturday)" });
	}

	try {
		const result = await db.query(
			"DELETE FROM business_hours WHERE org_id = $1 AND day_of_week = $2",
			[orgId, dayOfWeek]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: "Business hours entry not found for this day" });
		}

		return res.json({ deleted: true });
	} catch (err: any) {
		return res.status(500).json({ error: err.message });
	}
});
