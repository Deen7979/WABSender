import dotenv from "dotenv";

dotenv.config();

const required = [
	"DATABASE_URL",
	"WHATSAPP_TOKEN",
	"WHATSAPP_WEBHOOK_VERIFY_TOKEN",
	"GRAPH_API_VERSION",
	"JWT_SECRET",
	"JWT_REFRESH_SECRET",
	"META_APP_ID",
	"META_APP_SECRET",
	"META_OAUTH_REDIRECT_URI",
	"ENCRYPTION_KEY"
];

for (const key of required) {
	if (!process.env[key]) {
		throw new Error(`Missing required env var: ${key}`);
	}
}

export const config = {
	port: Number(process.env.PORT || 4000),
	databaseUrl: process.env.DATABASE_URL as string,
	whatsappToken: process.env.WHATSAPP_TOKEN as string,
	whatsappWebhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN as string,
	graphApiVersion: process.env.GRAPH_API_VERSION as string,
	jwtSecret: process.env.JWT_SECRET as string,
	jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
	metaAppId: process.env.META_APP_ID as string,
	metaAppSecret: process.env.META_APP_SECRET as string,
	metaOAuthRedirectUri: process.env.META_OAUTH_REDIRECT_URI as string,
	encryptionKey: process.env.ENCRYPTION_KEY as string,
	frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173"
};
