import { z } from "zod";
import { authedProcedure, PaginationSchema } from "../lib/orpc.js";

export const tenantsRouter = {
	// List user's tenants
	list: authedProcedure.input(PaginationSchema).query(async ({ input, context }) => {
		const skip = (input.page - 1) * input.limit;

		const [tenants, total] = await Promise.all([
			context.prisma.tenant.findMany({
				where: { userId: context.user.id },
				skip,
				take: input.limit,
				orderBy: { createdAt: "desc" },
				include: {
					deploymentLogs: {
						orderBy: { createdAt: "desc" },
						take: 1,
					},
				},
			}),
			context.prisma.tenant.count({
				where: { userId: context.user.id },
			}),
		]);

		// Get real-time status from orchestrator
		const tenantsWithStatus = await Promise.all(
			tenants.map(async (tenant) => {
				let containerStatus: "running" | "stopped" | "unknown" = "unknown";

				try {
					const metrics = await context.orchestrator.getTenantMetrics(tenant.id);
					if (metrics) {
						containerStatus = metrics.status;
					}
				} catch {
					// If we can't get metrics, use database status
				}

				return {
					...tenant,
					containerStatus,
				};
			}),
		);

		return {
			tenants: tenantsWithStatus,
			total,
			pages: Math.ceil(total / input.limit),
			currentPage: input.page,
		};
	}),

	// Get single tenant details
	get: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
			}),
		)
		.query(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
				include: {
					deploymentLogs: {
						orderBy: { createdAt: "desc" },
						take: 10,
					},
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			// Get real-time metrics
			const metrics = await context.orchestrator.getTenantMetrics(tenant.id);

			return {
				...tenant,
				metrics,
			};
		}),

	// Start a tenant
	start: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			if (tenant.status === "ACTIVE") {
				throw new Error("Tenant is already running");
			}

			// Create deployment log
			await context.prisma.deploymentLog.create({
				data: {
					tenantId: tenant.id,
					action: "START",
					status: "INITIATED",
				},
			});

			try {
				await context.orchestrator.startTenant(tenant.id);

				await context.prisma.tenant.update({
					where: { id: tenant.id },
					data: {
						status: "ACTIVE",
					},
				});

				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "START",
						status: "SUCCESS",
					},
				});

				return { success: true };
			} catch (error) {
				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "START",
						status: "FAILED",
						errorMessage: error instanceof Error ? error.message : "Unknown error",
					},
				});

				throw error;
			}
		}),

	// Stop a tenant
	stop: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			if (tenant.status === "STOPPED") {
				throw new Error("Tenant is already stopped");
			}

			// Create deployment log
			await context.prisma.deploymentLog.create({
				data: {
					tenantId: tenant.id,
					action: "STOP",
					status: "INITIATED",
				},
			});

			try {
				await context.orchestrator.stopTenant(tenant.id);

				await context.prisma.tenant.update({
					where: { id: tenant.id },
					data: {
						status: "STOPPED",
						stoppedAt: new Date(),
					},
				});

				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "STOP",
						status: "SUCCESS",
					},
				});

				return { success: true };
			} catch (error) {
				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "STOP",
						status: "FAILED",
						errorMessage: error instanceof Error ? error.message : "Unknown error",
					},
				});

				throw error;
			}
		}),

	// Restart a tenant
	restart: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			// Create deployment log
			await context.prisma.deploymentLog.create({
				data: {
					tenantId: tenant.id,
					action: "RESTART",
					status: "INITIATED",
				},
			});

			try {
				await context.orchestrator.restartTenant(tenant.id);

				await context.prisma.tenant.update({
					where: { id: tenant.id },
					data: {
						status: "ACTIVE",
					},
				});

				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "RESTART",
						status: "SUCCESS",
					},
				});

				return { success: true };
			} catch (error) {
				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "RESTART",
						status: "FAILED",
						errorMessage: error instanceof Error ? error.message : "Unknown error",
					},
				});

				throw error;
			}
		}),

	// Destroy a tenant
	destroy: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
				confirmation: z.literal("DELETE"),
			}),
		)
		.mutation(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			// Create deployment log
			await context.prisma.deploymentLog.create({
				data: {
					tenantId: tenant.id,
					action: "DESTROY",
					status: "INITIATED",
				},
			});

			try {
				// Update status to destroying
				await context.prisma.tenant.update({
					where: { id: tenant.id },
					data: {
						status: "DESTROYING",
					},
				});

				// Deprovision infrastructure
				await context.orchestrator.deprovisionTenant(tenant.id);

				// Delete from database
				await context.prisma.tenant.delete({
					where: { id: tenant.id },
				});

				return { success: true };
			} catch (error) {
				await context.prisma.tenant.update({
					where: { id: tenant.id },
					data: {
						status: "ERROR",
					},
				});

				await context.prisma.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "DESTROY",
						status: "FAILED",
						errorMessage: error instanceof Error ? error.message : "Unknown error",
					},
				});

				throw error;
			}
		}),

	// Get tenant logs
	getLogs: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
				lines: z.number().min(1).max(1000).default(100),
				since: z.number().optional(),
			}),
		)
		.query(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			const logs = await context.orchestrator.getTenantLogs(tenant.id, input.lines, input.since);

			return { logs };
		}),

	// Get tenant metrics
	getMetrics: authedProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
			}),
		)
		.query(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findFirst({
				where: {
					id: input.tenantId,
					userId: context.user.id,
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			const metrics = await context.orchestrator.getTenantMetrics(tenant.id);

			return metrics;
		}),
};
