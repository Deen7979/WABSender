import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { logger } from "../utils/logger.js";

type BootstrapConfig = {
	email: string;
	password: string;
	orgName?: string | null;
	orgId?: string | null;
};

const getBootstrapConfig = (): BootstrapConfig | null => {
	const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
	const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
	const orgName = process.env.BOOTSTRAP_ORG_NAME || null;
	const orgId = process.env.BOOTSTRAP_ORG_ID || null;

	if (!email || !password) {
		return null;
	}

	return { email, password, orgName, orgId };
};

const getSuperAdminConfig = () => {
	const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
	const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
	if (!email || !password) {
		return null;
	}
	return { email, password };
};

const maybeBootstrapSuperAdmin = async () => {
	const config = getSuperAdminConfig();
	if (!config) {
		logger.info("Bootstrap super admin skipped: missing BOOTSTRAP_SUPER_ADMIN_EMAIL or BOOTSTRAP_SUPER_ADMIN_PASSWORD");
		return;
	}

	const existingSuperAdmin = await db.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
	if ((existingSuperAdmin.rowCount ?? 0) > 0) {
		logger.info("Bootstrap super admin skipped: super_admin already exists");
		return;
	}

	const emailExists = await db.query("SELECT id, role FROM users WHERE email = $1", [config.email]);
	if ((emailExists.rowCount ?? 0) > 0) {
		logger.warn("Bootstrap super admin skipped: user with email already exists", { email: config.email });
		return;
	}

	const passwordHash = await bcrypt.hash(config.password, 10);
	const userResult = await db.query(
		"INSERT INTO users (org_id, email, password_hash, role, is_active) VALUES (NULL, $1, $2, 'super_admin', true) RETURNING id",
		[config.email, passwordHash]
	);

	logger.info("Bootstrap super admin created", { userId: userResult.rows[0]?.id });
};

const resolveOrgId = async (config: BootstrapConfig): Promise<string | null> => {
	if (config.orgId) {
		const orgResult = await db.query("SELECT id FROM orgs WHERE id = $1", [config.orgId]);
		if (orgResult.rowCount === 0) {
			logger.error("Bootstrap admin failed: orgId not found", { orgId: config.orgId });
			return null;
		}
		return config.orgId;
	}

	if (!config.orgName) {
		logger.warn("Bootstrap admin skipped: BOOTSTRAP_ORG_NAME or BOOTSTRAP_ORG_ID required");
		return null;
	}

	const orgResult = await db.query(
		"INSERT INTO orgs (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
		[config.orgName]
	);
	return orgResult.rows[0]?.id ?? null;
};

export const maybeBootstrapAdmin = async (): Promise<void> => {
	await maybeBootstrapSuperAdmin();

	const config = getBootstrapConfig();
	if (!config) {
		logger.info("Bootstrap admin skipped: missing BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD");
		return;
	}

	const orgId = await resolveOrgId(config);
	if (!orgId) {
		return;
	}

	const existingAdmin = await db.query(
		"SELECT id FROM users WHERE org_id = $1 AND role = 'admin' LIMIT 1",
		[orgId]
	);
	if ((existingAdmin.rowCount ?? 0) > 0) {
		logger.info("Bootstrap admin skipped: admin already exists for org", { orgId });
		return;
	}

	const emailExists = await db.query("SELECT id, role FROM users WHERE email = $1", [config.email]);
	if ((emailExists.rowCount ?? 0) > 0) {
		logger.warn("Bootstrap admin skipped: user with email already exists", { email: config.email });
		return;
	}

	const passwordHash = await bcrypt.hash(config.password, 10);
	const userResult = await db.query(
		"INSERT INTO users (org_id, email, password_hash, role, is_active) VALUES ($1, $2, $3, 'admin', true) RETURNING id",
		[orgId, config.email, passwordHash]
	);

	logger.info("Bootstrap admin created", { userId: userResult.rows[0]?.id, orgId });
};
