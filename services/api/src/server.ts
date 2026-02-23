import express from "express";
import cors from "cors";
import http from "http";
import { config } from "./config/index.js";
import { attachWebSocket } from "./websocket/hub.js";
import { logger } from "./utils/logger.js";
import { authRouter } from "./routes/auth.routes.js";
import { metaOAuthRouter } from "./routes/meta-oauth.routes.js";
import { contactsRouter } from "./routes/contacts.routes.js";
import { templatesRouter } from "./routes/templates.routes.js";
import { campaignsRouter } from "./routes/campaigns.routes.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";
import { webhookStatusRouter } from "./routes/webhook-status.routes.js";
import { whatsappAccountsRouter } from "./routes/whatsapp-accounts.routes.js";
import { optInRouter } from "./routes/opt-in.routes.js";
import { conversationsRouter } from "./routes/conversations.routes.js";
import { automationsRouter } from "./routes/automations.routes.js";
import { businessHoursRouter } from "./routes/business-hours.routes.js";
import reportsRouter from "./routes/reports.routes.js";
import auditLogsRouter from "./routes/audit-logs.routes.js";
import { licenseRouter } from "./routes/license.routes.js";
import { subscriptionLicenseRouter } from "./routes/subscription-license.routes.js";
import { orgsRouter } from "./routes/orgs.routes.js";
import { platformRouter } from "./routes/platform.routes.js";
import { platformLicenseRouter } from "./routes/platform-license.routes.js";
import usersRouter from "./routes/users.routes.js";
import { startScheduler, stopScheduler } from "./jobs/campaignScheduler.js";
import { startQueueWorker, stopQueueWorker } from "./jobs/queueWorker.js";
import { maybeBootstrapAdmin } from "./services/bootstrapAdmin.js";

export const createServer = () => {
	const app = express();
	app.use(cors());
	app.use(express.json({ limit: "2mb" }));

	app.get("/health", (_req, res) => res.json({ status: "ok" }));

	app.use("/auth", authRouter);
	app.use("/auth/meta-oauth", metaOAuthRouter);
	app.use("/contacts", contactsRouter);
	app.use("/templates", templatesRouter);
	app.use("/campaigns", campaignsRouter);
	app.use("/messages", messagesRouter);
	app.use("/whatsapp-accounts", whatsappAccountsRouter);
	app.use("/opt-in", optInRouter);
	app.use("/conversations", conversationsRouter);
	app.use("/automations", automationsRouter);
	app.use("/business-hours", businessHoursRouter);
	app.use("/reports", reportsRouter);
	app.use("/audit-logs", auditLogsRouter);
	app.use("/license", licenseRouter);
	app.use("/subscription", subscriptionLicenseRouter);
	app.use("/orgs", orgsRouter);
	app.use("/users", usersRouter);
	app.use("/api/platform", platformRouter);
	app.use("/api/platform", platformLicenseRouter);
	app.use("/webhooks", webhooksRouter);
	app.use("/webhook", webhookStatusRouter);

	void maybeBootstrapAdmin().catch((error) => {
		logger.error("Bootstrap admin failed", { error: error instanceof Error ? error.message : String(error) });
	});

	const server = http.createServer(app);
	attachWebSocket(server);

	server.listen(config.port, () => {
		logger.info(`API listening on ${config.port}`);
		
		// Start campaign scheduler and queue worker
		startScheduler();
		startQueueWorker();
	});

	// Graceful shutdown handlers
	const shutdown = () => {
		logger.info("Shutting down gracefully...");
		stopScheduler();
		stopQueueWorker();
		server.close(() => {
			logger.info("Server closed");
			process.exit(0);
		});
		
		// Force exit after 10 seconds if graceful shutdown fails
		setTimeout(() => {
			logger.error("Forced shutdown after timeout");
			process.exit(1);
		}, 10_000);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	process.on("unhandledRejection", (reason) => {
		logger.error("Unhandled promise rejection", { reason });
	});

	process.on("uncaughtException", (error) => {
		logger.error("Uncaught exception", { error: error.message });
	});

	return { app, server };
};
