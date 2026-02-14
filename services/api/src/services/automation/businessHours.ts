import { db } from "../../db/index.js";

export interface BusinessHoursConfig {
	id: string;
	timezone: string;
	day_of_week: number;
	start_time: string;
	end_time: string;
}

/**
 * Get all business hours rules for an org
 */
export async function getOrgBusinessHours(orgId: string): Promise<BusinessHoursConfig[]> {
	const result = await db.query(
		`SELECT id, timezone, day_of_week, start_time, end_time
		 FROM business_hours
		 WHERE org_id = $1
		 ORDER BY day_of_week ASC, start_time ASC`,
		[orgId]
	);
	return result.rows;
}

/**
 * Check if current time is within business hours for an org
 * Returns { isOpen, reason }
 */
export async function isWithinBusinessHours(
	orgId: string
): Promise<{ isOpen: boolean; reason: string; timezone?: string; currentTime?: string; dayOfWeek?: number }> {
	try {
		const businessHours = await getOrgBusinessHours(orgId);

		// No business hours configured = always open
		if (businessHours.length === 0) {
			return { isOpen: true, reason: "No business hours configured" };
		}

		// Use first entry's timezone (all entries should have same timezone per org)
		const timezone = businessHours[0].timezone;

		// Get current time in org's timezone
		const now = new Date().toLocaleString("en-US", { timeZone: timezone });
		const currentDate = new Date(now);
		const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
		const currentTime = `${String(currentDate.getHours()).padStart(2, "0")}:${String(
			currentDate.getMinutes()
		).padStart(2, "0")}:00`;

		// Check if current day/time falls within business hours
		const matching = businessHours.find(
			(row) => row.day_of_week === dayOfWeek && row.start_time <= currentTime && currentTime < row.end_time
		);

		if (matching) {
			return { isOpen: true, reason: "Within business hours", timezone, currentTime, dayOfWeek };
		}

		return {
			isOpen: false,
			reason: "Outside business hours",
			timezone,
			currentTime,
			dayOfWeek,
		};
	} catch (err: any) {
		console.error("[BusinessHours] Error checking hours:", err);
		// On error, assume open (safe default)
		return { isOpen: true, reason: "Error checking business hours, defaulting to open" };
	}
}

/**
 * Convert time string (HH:MM) to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours * 60 + minutes;
}

/**
 * Get next business hours start time for an org
 * Useful for scheduling out-of-hours message delivery
 */
export async function getNextBusinessHoursStart(
	orgId: string
): Promise<{ timestamp: Date; timezone: string; dayOfWeek: number; time: string } | null> {
	try {
		const businessHours = await getOrgBusinessHours(orgId);

		if (businessHours.length === 0) {
			return null; // No business hours configured
		}

		const timezone = businessHours[0].timezone;
		const now = new Date().toLocaleString("en-US", { timeZone: timezone });
		const currentDate = new Date(now);
		const currentDayOfWeek = currentDate.getDay();
		const currentTimeMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

		// Sort by day and time
		const sorted = businessHours.sort((a, b) => {
			if (a.day_of_week !== b.day_of_week) {
				return a.day_of_week - b.day_of_week;
			}
			return timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
		});

		// Find next opening
		for (const hours of sorted) {
			const startMinutes = timeToMinutes(hours.start_time);

			// Same day, time hasn't passed
			if (hours.day_of_week === currentDayOfWeek && startMinutes > currentTimeMinutes) {
				return {
					timestamp: new Date(),
					timezone,
					dayOfWeek: hours.day_of_week,
					time: hours.start_time,
				};
			}

			// Future day
			if (hours.day_of_week > currentDayOfWeek) {
				return {
					timestamp: new Date(),
					timezone,
					dayOfWeek: hours.day_of_week,
					time: hours.start_time,
				};
			}
		}

		// Next opening is first one of the week (next week)
		const firstHours = sorted[0];
		return {
			timestamp: new Date(),
			timezone,
			dayOfWeek: firstHours.day_of_week,
			time: firstHours.start_time,
		};
	} catch (err: any) {
		console.error("[BusinessHours] Error getting next start time:", err);
		return null;
	}
}

/**
 * Log out-of-hours message reception for potential batch processing when hours resume
 */
export async function logOutOfHoursMessage(
	orgId: string,
	contactId: string,
	conversationId: string,
	messageId: string,
	body: string
): Promise<void> {
	try {
		// Insert into a temporary queue or logging table
		// For now, just log to console
		console.log(
			`[BusinessHours] Out-of-hours message from contact ${contactId}: "${body}" (message ${messageId})`
		);
		// In a full implementation, you would insert into an out_of_hours_message_queue table
	} catch (err: any) {
		console.error("[BusinessHours] Error logging OOH message:", err);
	}
}
