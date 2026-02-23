import { readFileSync, readdirSync } from "fs";
import { Client } from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const splitSqlStatements = (sql) => {
  const statements = [];
  let current = "";

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !dollarQuoteTag) {
      if (char === "-" && next === "-") {
        current += char + next;
        i += 1;
        inLineComment = true;
        continue;
      }

      if (char === "/" && next === "*") {
        current += char + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
    }

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, i)) {
        current += dollarQuoteTag;
        i += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarQuoteTag = match[0];
        current += dollarQuoteTag;
        i += dollarQuoteTag.length - 1;
        continue;
      }
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (next === "'") {
          current += next;
          i += 1;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        if (next === '"') {
          current += next;
          i += 1;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
};

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
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (error) {
        const code = error?.code;
        if (code === "42P07" || code === "42710" || code === "42701") {
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
