import { Client } from "pg";

const databaseUrl = "postgresql://postgres:Naja@775@localhost:5432/wabsender";
const client = new Client({ connectionString: databaseUrl });

try {
	await client.connect();
	const res = await client.query(
		"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'whatsapp_accounts' ORDER BY ordinal_position"
	);
	console.log("whatsapp_accounts columns:");
	res.rows.forEach((row) => console.log(`  ${row.column_name}: ${row.data_type}`));
	await client.end();
} catch (err) {
	console.error("Error:", err.message);
	process.exit(1);
}
