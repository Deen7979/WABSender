export const logger = {
	info: (message: string, meta?: unknown) => {
		console.log(`[INFO] ${message}`, meta ?? "");
	},
	warn: (message: string, meta?: unknown) => {
		console.warn(`[WARN] ${message}`, meta ?? "");
	},
	error: (message: string, meta?: unknown) => {
		console.error(`[ERROR] ${message}`, meta ?? "");
	},
	debug: (message: string, meta?: unknown) => {
		if (process.env.DEBUG === "true") {
			console.log(`[DEBUG] ${message}`, meta ?? "");
		}
	}
};
