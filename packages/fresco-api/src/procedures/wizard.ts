import crypto from "node:crypto";
import { z } from "zod";
import { publicProcedure, SubdomainSchema } from "../lib/orpc.js";

// Wizard step schemas
const _SignupDataSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	useCase: z.enum(["study", "testing", "learning", "other"]),
	useCaseOther: z.string().optional(),
	subdomain: z.string(),
	agreedToTerms: z.boolean(),
});

export const wizardRouter = {
	// Check subdomain availability
	checkSubdomain: publicProcedure
		.input(
			z.object({
				subdomain: SubdomainSchema,
			}),
		)
		.query(async ({ input, context }) => {
			const existing = await context.prisma.tenant.findUnique({
				where: { subdomain: input.subdomain },
			});

			// Generate suggestions if taken
			const suggestions: string[] = [];
			if (existing) {
				const base = input.subdomain;
				for (let i = 1; i <= 3; i++) {
					const suggestion = `${base}${i}`;
					const exists = await context.prisma.tenant.findUnique({
						where: { subdomain: suggestion },
					});
					if (!exists) {
						suggestions.push(suggestion);
					}
				}

				// Add random suffix suggestions
				const randomSuffix = crypto.randomBytes(2).toString("hex");
				suggestions.push(`${base}-${randomSuffix}`);
			}

			return {
				available: !existing,
				suggestions,
			};
		}),

	// Create signup session
	createSession: publicProcedure
		.input(
			z.object({
				email: z.string().email(),
			}),
		)
		.mutation(async ({ input, context }) => {
			// Check if email already has an active session
			const existingSession = await context.prisma.signupSession.findFirst({
				where: {
					email: input.email,
					expiresAt: {
						gt: new Date(),
					},
				},
			});

			if (existingSession) {
				return {
					sessionId: existingSession.id,
					resumed: true,
				};
			}

			// Create new session
			const session = await context.prisma.signupSession.create({
				data: {
					email: input.email,
					stepCompleted: 0,
					data: {},
					expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
				},
			});

			return {
				sessionId: session.id,
				resumed: false,
			};
		}),

	// Update session data
	updateSession: publicProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				step: z.number().min(1).max(6),
				data: z.record(z.any()),
			}),
		)
		.mutation(async ({ input, context }) => {
			const session = await context.prisma.signupSession.findUnique({
				where: { id: input.sessionId },
			});

			if (!session) {
				throw new Error("Session not found");
			}

			if (session.expiresAt < new Date()) {
				throw new Error("Session expired");
			}

			// Merge data and update step
			const updatedData = {
				...(session.data as object),
				...input.data,
			};

			await context.prisma.signupSession.update({
				where: { id: input.sessionId },
				data: {
					stepCompleted: Math.max(session.stepCompleted, input.step),
					data: updatedData,
				},
			});

			return { success: true };
		}),

	// Get session data
	getSession: publicProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
			}),
		)
		.query(async ({ input, context }) => {
			const session = await context.prisma.signupSession.findUnique({
				where: { id: input.sessionId },
			});

			if (!session) {
				throw new Error("Session not found");
			}

			if (session.expiresAt < new Date()) {
				throw new Error("Session expired");
			}

			return {
				email: session.email,
				stepCompleted: session.stepCompleted,
				data: session.data as Record<string, any>,
			};
		}),

	// Deploy tenant (final step)
	deployTenant: publicProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input, context }) => {
			const session = await context.prisma.signupSession.findUnique({
				where: { id: input.sessionId },
			});

			if (!session) {
				throw new Error("Session not found");
			}

			if (session.expiresAt < new Date()) {
				throw new Error("Session expired");
			}

			const data = session.data as any;
			if (!data.email || !data.password || !data.subdomain) {
				throw new Error("Incomplete session data");
			}

			// Start a transaction
			const result = await context.prisma.$transaction(async (tx) => {
				// Create user account
				// Note: In production, you'd use Better Auth for this
				const user = await tx.user.create({
					data: {
						email: data.email,
						emailVerified: false,
					},
				});

				// Create tenant record
				const tenant = await tx.tenant.create({
					data: {
						userId: user.id,
						tenantIdentifier: crypto.randomUUID(),
						subdomain: data.subdomain,
						status: "PROVISIONING",
						databaseSchema: `tenant_${crypto.randomUUID().replace(/-/g, "_")}`,
						databaseUser: `tenant_user_${crypto.randomUUID().replace(/-/g, "_")}`,
						metadata: {
							useCase: data.useCase,
							useCaseOther: data.useCaseOther,
						},
					},
				});

				// Create deployment log
				await tx.deploymentLog.create({
					data: {
						tenantId: tenant.id,
						action: "CREATE",
						status: "INITIATED",
					},
				});

				return { user, tenant };
			});

			// Provision infrastructure asynchronously
			// In production, this would be handled by a queue
			setImmediate(async () => {
				try {
					const provisionResult = await context.orchestrator.provisionTenant({
						tenantId: result.tenant.id,
						userId: result.user.id,
						subdomain: result.tenant.subdomain,
					});

					if (provisionResult.status === "success") {
						await context.prisma.tenant.update({
							where: { id: result.tenant.id },
							data: {
								status: "ACTIVE",
								containerId: provisionResult.containerId,
								lastDeployedAt: new Date(),
							},
						});

						await context.prisma.deploymentLog.create({
							data: {
								tenantId: result.tenant.id,
								action: "CREATE",
								status: "SUCCESS",
								metadata: {
									containerId: provisionResult.containerId,
								},
							},
						});
					} else {
						await context.prisma.tenant.update({
							where: { id: result.tenant.id },
							data: {
								status: "ERROR",
							},
						});

						await context.prisma.deploymentLog.create({
							data: {
								tenantId: result.tenant.id,
								action: "CREATE",
								status: "FAILED",
								errorMessage: provisionResult.error,
							},
						});
					}
				} catch (error) {
					await context.prisma.tenant.update({
						where: { id: result.tenant.id },
						data: {
							status: "ERROR",
						},
					});

					await context.prisma.deploymentLog.create({
						data: {
							tenantId: result.tenant.id,
							action: "CREATE",
							status: "FAILED",
							errorMessage: error instanceof Error ? error.message : "Unknown error",
						},
					});
				}
			});

			// Clean up session
			await context.prisma.signupSession.delete({
				where: { id: input.sessionId },
			});

			return {
				userId: result.user.id,
				tenantId: result.tenant.id,
				subdomain: result.tenant.subdomain,
			};
		}),

	// Get deployment status
	getDeploymentStatus: publicProcedure
		.input(
			z.object({
				tenantId: z.string().uuid(),
			}),
		)
		.query(async ({ input, context }) => {
			const tenant = await context.prisma.tenant.findUnique({
				where: { id: input.tenantId },
				include: {
					deploymentLogs: {
						orderBy: { createdAt: "desc" },
						take: 1,
					},
				},
			});

			if (!tenant) {
				throw new Error("Tenant not found");
			}

			const latestLog = tenant.deploymentLogs[0];

			return {
				status: tenant.status,
				subdomain: tenant.subdomain,
				lastAction: latestLog?.action,
				lastStatus: latestLog?.status,
				error: latestLog?.errorMessage,
			};
		}),
};
