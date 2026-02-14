import { readFileSync, readdirSync } from "fs";
import { Client } from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in environment.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../src/db/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  for (const migrationFile of migrationFiles) {
    const sql = readFileSync(resolve(migrationsDir, migrationFile), "utf8");
    const statements = sql
      .split(/;\s*\n/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (error) {
        const code = error?.code;
        if (code === "42P07" || code === "42710") {
          // Object already exists (table/extension). Skip for idempotency.
          continue;
        }
        console.error(`Migration failed in ${migrationFile} on statement:`);
        console.error(statement);
        throw error;
      }
    }
  }

  console.log("Migrations applied");
} finally {
  await client.end();
}
