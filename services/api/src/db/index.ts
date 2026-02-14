import { Pool } from "pg";
import { config } from "../config/index.js";

export const pool = new Pool({
	connectionString: config.databaseUrl
});

export const db = {
	query: (text: string, params?: unknown[]) => pool.query(text, params)
};
