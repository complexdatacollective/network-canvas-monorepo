import { Orchestrator } from "@fresco/orchestrator";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono, type Context as HonoContext } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import type { Context } from "./lib/orpc.js";
import { authMiddleware } from "./middleware/auth.js";
import { apiRouter } from "./router.js";

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Orchestrator
const orchestrator = new Orchestrator({
	dockerHost: process.env.DOCKER_HOST,
	dockerNetwork: process.env.DOCKER_NETWORK || "fresco-platform-network",
	databaseUrl: process.env.DATABASE_URL || "",
	frescoImage: process.env.FRESCO_IMAGE || "ghcr.io/complexdatacollective/fresco:latest",
	defaultMemory: Number.parseInt(process.env.DEFAULT_MEMORY || "512", 10),
	defaultCpus: Number.parseFloat(process.env.DEFAULT_CPUS || "0.5"),
});

// Create Hono app
const app = new Hono<{
	Variables: {
		user?: {
			id: string;
			email: string;
		};
	};
}>();

// Apply CORS middleware
app.use(
	"*",
	cors({
		origin: process.env.CORS_ORIGIN || "http://localhost:3001",
		credentials: true,
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	}),
);

// Better Auth handler - must be before auth middleware
app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

// Apply auth middleware to all routes
app.use("*", authMiddleware);

// Health check endpoint
app.get("/health", async (c) => {
	const health = await orchestrator.healthCheck();
	return c.json({
		status: health.overall ? "healthy" : "unhealthy",
		docker: health.docker,
		database: health.database,
		timestamp: new Date().toISOString(),
	});
});

// oRPC handler
app.post("/api/*", async (c: HonoContext) => {
	const pathname = new URL(c.req.url).pathname.replace("/api/", "");
	const body = await c.req.json();

	// Create context
	const context: Context = {
		prisma,
		orchestrator,
		user: c.get("user"),
	};

	// Handle the request
	try {
		const [procedurePath] = pathname.split("/");
		const procedure = procedurePath?.split(".").reduce((acc: any, part) => acc?.[part], apiRouter as any);

		if (!procedure || typeof procedure !== "function") {
			return c.json({ error: "Procedure not found" }, 404);
		}

		const result = await procedure(body, context);
		return c.json({ result });
	} catch (error) {
		console.error("oRPC Error:", error);
		return c.json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
	}
});

// Start server
const port = Number.parseInt(process.env.PORT || "3000", 10);

// Start metrics collection
const stopMetrics = orchestrator.startMetricsCollection();

// Graceful shutdown
process.on("SIGTERM", async () => {
	stopMetrics();
	await prisma.$disconnect();
	process.exit(0);
});

process.on("SIGINT", async () => {
	stopMetrics();
	await prisma.$disconnect();
	process.exit(0);
});

// Start the server
serve({
	fetch: app.fetch,
	port,
});
