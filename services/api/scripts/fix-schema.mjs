import { Client } from "pg";

const databaseUrl = "postgresql://postgres:Naja@775@localhost:5432/wabsender";
const client = new Client({ connectionString: databaseUrl });

try {
	await client.connect();

	// Add missing columns to whatsapp_accounts
	const statements = [
		"ALTER TABLE whatsapp_accounts ADD COLUMN business_id TEXT",
		"ALTER TABLE whatsapp_accounts ADD COLUMN access_token TEXT",
		"ALTER TABLE whatsapp_accounts ADD COLUMN token_expires_at TIMESTAMP",
		"ALTER TABLE whatsapp_accounts ADD COLUMN updated_at TIMESTAMP DEFAULT now()",
	];

	for (const statement of statements) {
		try {
			await client.query(statement);
			console.log(`✓ ${statement.split(" ").slice(0, 4).join(" ")}`);
		} catch (err) {
			if (err.code === "42701") {
				// Column already exists
				console.log(`⊘ Column already exists`);
			} else {
				throw err;
			}
		}
	}

	console.log("\nDone. Schema updated.");
	await client.end();
} catch (err) {
	console.error("Error:", err.message);
	process.exit(1);
}
