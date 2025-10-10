import { orpc } from "./lib/orpc.js";
import { authRouter } from "./procedures/auth.js";
import { tenantsRouter } from "./procedures/tenants.js";
import { wizardRouter } from "./procedures/wizard.js";

// Combine all routers into the main API router
export const apiRouter = orpc.router({
	auth: authRouter,
	wizard: wizardRouter,
	tenants: tenantsRouter,
});

// Export the router type for client-side usage
export type ApiRouter = typeof apiRouter;
