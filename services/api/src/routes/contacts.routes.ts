import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import { Readable } from "stream";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { auditLog, AuditAction, ResourceType } from "../middleware/auditLog.js";

export const contactsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const normalizePhone = (value: string) => {
	const trimmed = value.trim();
	if (trimmed.startsWith("+")) return trimmed;
	const digits = trimmed.replace(/\D/g, "");
	return digits ? `+${digits}` : trimmed;
};

const parseRows = (rows: Array<Record<string, unknown>>) => {
	return rows.map((row) => {
		const originalKeys = Object.keys(row);
		const phoneKey = originalKeys.find((k) =>
			["phone", "phone_e164", "number", "mobile"].includes(k.toLowerCase())
		);
		const nameKey = originalKeys.find((k) =>
			["name", "full_name"].includes(k.toLowerCase())
		);
		const phone = phoneKey ? String(row[phoneKey]) : "";
		const name = nameKey ? String(row[nameKey]) : "";
		return { phone, name, customFields: row };
	});
};

const readWorkbookRows = async (buffer: Buffer, filename: string) => {
	const workbook = new ExcelJS.Workbook();
	const ext = path.extname(filename).toLowerCase();

	const fileBuffer: Buffer = Buffer.from(buffer as unknown as Uint8Array) as unknown as Buffer;
	if (ext === ".csv") {
		await workbook.csv.read(Readable.from(fileBuffer));
	} else {
		await workbook.xlsx.load(fileBuffer as any);
	}

	const worksheet = workbook.worksheets[0];
	if (!worksheet) return [];

	const headerRow = worksheet.getRow(1);
	const headerValues = (Array.isArray(headerRow.values) ? headerRow.values : []) as ExcelJS.CellValue[];
	const headers: string[] = headerValues
		.slice(1)
		.map((value) => String(value ?? "").trim());

	const rows: Array<Record<string, unknown>> = [];
	worksheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		const record: Record<string, unknown> = {};
		headers.forEach((header, index) => {
			if (!header) return;
			record[header] = row.getCell(index + 1).value ?? "";
		});
		rows.push(record);
	});

	return rows;
};

contactsRouter.get("/", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const result = await db.query(
		"SELECT id, phone_e164, name, custom_fields FROM contacts WHERE org_id = $1 ORDER BY created_at DESC",
		[orgId]
	);
	return res.json(result.rows);
});

contactsRouter.post("/", requireAuth, async (req, res) => {
	const orgId = req.auth!.orgId;
	const { phoneE164, name, customFields } = req.body as {
		phoneE164?: string;
		name?: string;
		customFields?: Record<string, unknown>;
	};

	if (!phoneE164) {
		return res.status(400).json({ error: "phoneE164 required" });
	}

	const normalized = normalizePhone(phoneE164);
	const result = await db.query(
		"INSERT INTO contacts (org_id, phone_e164, name, custom_fields) VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, phone_e164) DO UPDATE SET name = EXCLUDED.name, custom_fields = EXCLUDED.custom_fields RETURNING id, phone_e164, name, custom_fields",
		[orgId, normalized, name || null, customFields || null]
	);

	const contactId = result.rows[0].id;
	await auditLog(req, AuditAction.CONTACT_CREATED, ResourceType.CONTACT, contactId, {
		phoneE164: normalized,
		name,
	});

	return res.json(result.rows[0]);
});

contactsRouter.post("/import", requireAuth, upload.single("file"), async (req, res) => {
	const orgId = req.auth!.orgId;
	if (!req.file) {
		return res.status(400).json({ error: "file required" });
	}

	const rows = await readWorkbookRows(req.file.buffer, req.file.originalname);
	const parsed = parseRows(rows)
		.filter((row) => row.phone)
		.map((row) => ({
			phone_e164: normalizePhone(row.phone),
			name: row.name || null,
			custom_fields: row.customFields || null
		}));

	let imported = 0;
	for (const row of parsed) {
		const contactResult = await db.query(
			"INSERT INTO contacts (org_id, phone_e164, name, custom_fields) VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, phone_e164) DO UPDATE SET name = EXCLUDED.name, custom_fields = EXCLUDED.custom_fields RETURNING id",
			[orgId, row.phone_e164, row.name, row.custom_fields]
		);

		const contactId = contactResult.rows[0].id;
		await db.query(
			"INSERT INTO opt_in_events (org_id, contact_id, event_type, source) VALUES ($1, $2, 'opt_in', 'import')",
			[orgId, contactId]
		);

		imported += 1;
	}

	await auditLog(req, AuditAction.CONTACT_IMPORTED, ResourceType.CONTACT, undefined, {
		filename: req.file.originalname,
		imported,
		total: parsed.length,
	});

	return res.json({ imported });
});
