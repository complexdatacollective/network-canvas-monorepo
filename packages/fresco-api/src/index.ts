// Export the main router and types

export type { Context } from "./lib/orpc.js";
// Export common schemas for client-side use
export {
	PaginationSchema,
	SubdomainSchema,
	TenantStatusSchema,
} from "./lib/orpc.js";
export type { ApiRouter } from "./router.js";
export { apiRouter } from "./router.js";
