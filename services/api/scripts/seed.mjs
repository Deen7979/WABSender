#!/usr/bin/env node

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env") });

// Import and run seed
import("./src/db/seed/seed.ts").catch((err) => {
	console.error("Failed to run seed:", err);
	process.exit(1);
});
