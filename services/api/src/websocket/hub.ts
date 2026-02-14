import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import url from "url";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { db } from "../db/index.js";

type ClientContext = {
	socket: WebSocket;
	orgId: string;
	userId: string;
};

const clients = new Set<ClientContext>();

export const attachWebSocket = (server: http.Server) => {
	const wss = new WebSocketServer({ server, path: "/realtime" });

	wss.on("connection", async (socket, req) => {
		const parsed = url.parse(req.url || "", true);
		const token = parsed.query.token;
		if (!token || typeof token !== "string") {
			socket.close(1008, "Missing token");
			return;
		}

		try {
			const payload = jwt.verify(token, config.jwtSecret) as { orgId: string; userId: string; role: string };
			let orgId = payload.orgId || null;
			if (!orgId && payload.role === "super_admin") {
				const queryOrgId = parsed.query.orgId;
				if (typeof queryOrgId === "string") {
					const orgResult = await db.query("SELECT id FROM orgs WHERE id = $1", [queryOrgId]);
					if ((orgResult.rowCount ?? 0) > 0) {
						orgId = queryOrgId;
					}
				}
			}

			if (!orgId) {
				socket.close(1008, "Org context required");
				return;
			}

			const ctx: ClientContext = { socket, orgId, userId: payload.userId };
			clients.add(ctx);

			socket.on("close", () => clients.delete(ctx));
		} catch (err) {
			logger.warn("WebSocket auth failed", err);
			const errorMessage = err instanceof Error && err.name === 'TokenExpiredError'
				? "Token expired"
				: "Invalid token";
			socket.close(1008, errorMessage);
		}
	});
};

export const broadcastToOrg = (orgId: string, event: string, payload: unknown) => {
	const message = JSON.stringify({ event, payload });
	for (const client of clients) {
		if (client.orgId === orgId) {
			client.socket.send(message);
		}
	}
};
