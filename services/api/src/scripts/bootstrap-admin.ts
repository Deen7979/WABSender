import { maybeBootstrapAdmin } from "../services/bootstrapAdmin.js";

const run = async () => {
	await maybeBootstrapAdmin();
};

run()
	.then(() => {
		console.log("Bootstrap admin completed");
		process.exit(0);
	})
	.catch((err) => {
		console.error("Bootstrap admin failed", err);
		process.exit(1);
	});
