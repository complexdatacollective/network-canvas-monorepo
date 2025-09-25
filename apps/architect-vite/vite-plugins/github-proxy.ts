import { DEVELOPMENT_PROTOCOL_URL } from "~/config";

/**
 * Vite plugin that creates a development proxy for GitHub protocol files
 * This bypasses CORS issues by making GitHub requests server-side
 */
export const githubProxyPlugin = () => ({
	name: "github-proxy",
	configureServer(server) {
		server.middlewares.use("/api/github-development-protocol", async (req, res, next) => {
			if (req.method !== "GET") {
				return next();
			}

			try {
				const fileResponse = await fetch(DEVELOPMENT_PROTOCOL_URL, {
					headers: {
						"User-Agent": "architect-vite-app",
					},
				});

				if (!fileResponse.ok) {
					throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
				}

				const buffer = await fileResponse.arrayBuffer();

				// Set appropriate headers
				res.setHeader("Content-Type", "application/octet-stream");
				res.setHeader("Content-Length", buffer.byteLength);
				res.setHeader("Access-Control-Allow-Origin", "*");

				// Send the file
				res.end(Buffer.from(buffer));
			} catch (error) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: error.message }));
			}
		});
	},
});
