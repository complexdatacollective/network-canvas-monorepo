import type { Orchestrator } from "@fresco/orchestrator";
import { os } from "@orpc/server";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

// Define the context type
export interface Context {
	prisma: PrismaClient;
	orchestrator: Orchestrator;
	user?: {
		id: string;
		email: string;
	};
}

// Create the base oRPC instance
export const orpc = os.$context<Context>();

// Public procedure (no auth required)
export const publicProcedure = orpc;

// Authenticated procedure (requires user in context)
export const authedProcedure = orpc.use(async ({ context, next }: any) => {
	if (!context.user) {
		throw new Error("Unauthorized");
	}
	return next({
		context: {
			...context,
			user: context.user,
		},
	});
});

// Common schemas
export const PaginationSchema = z.object({
	page: z.number().min(1).default(1),
	limit: z.number().min(1).max(100).default(10),
});

export const SubdomainSchema = z
	.string()
	.min(3)
	.max(63)
	.regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, "Subdomain must be lowercase alphanumeric and hyphens only");

export const TenantStatusSchema = z.enum(["PENDING", "PROVISIONING", "ACTIVE", "STOPPED", "ERROR", "DESTROYING"]);
