import { z } from "zod";
import type { TenantDatabaseInfo } from "./database/schema-manager.js";
import { SchemaManager } from "./database/schema-manager.js";
import type { ContainerConfig } from "./docker/container-manager.js";
import { ContainerManager } from "./docker/container-manager.js";
import type { TenantMetrics } from "./monitoring/metrics-collector.js";
import { MetricsCollector } from "./monitoring/metrics-collector.js";

export const OrchestratorConfigSchema = z.object({
	dockerHost: z.string().optional(),
	dockerNetwork: z.string().default("fresco-platform-network"),
	databaseUrl: z.string(),
	frescoImage: z.string().default("ghcr.io/complexdatacollective/fresco:latest"),
	defaultMemory: z.number().default(512), // MB
	defaultCpus: z.number().default(0.5),
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export const TenantConfigSchema = z.object({
	tenantId: z.string().uuid(),
	userId: z.string().uuid(),
	subdomain: z.string(),
	memory: z.number().optional(),
	cpus: z.number().optional(),
	environmentVars: z.record(z.string(), z.string()).optional(),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

export interface TenantProvisionResult {
	tenantId: string;
	containerId: string;
	database: TenantDatabaseInfo;
	subdomain: string;
	status: "success" | "error";
	error?: string;
}

export class Orchestrator {
	private containerManager: ContainerManager;
	private schemaManager: SchemaManager;
	private metricsCollector: MetricsCollector;
	private config: OrchestratorConfig;

	constructor(config: OrchestratorConfig) {
		this.config = OrchestratorConfigSchema.parse(config);
		this.containerManager = new ContainerManager(config.dockerHost, config.dockerNetwork);
		this.schemaManager = new SchemaManager(config.databaseUrl);
		this.metricsCollector = new MetricsCollector(this.containerManager, this.schemaManager);
	}

	/**
	 * Provision a new tenant (creates schema and container)
	 */
	async provisionTenant(config: TenantConfig): Promise<TenantProvisionResult> {
		const validatedConfig = TenantConfigSchema.parse(config);

		try {
			// Step 1: Create database schema and user
			const database = await this.schemaManager.createTenantSchema({
				tenantId: validatedConfig.tenantId,
				databaseUrl: this.config.databaseUrl,
				schemaPrefix: "tenant",
			});

			try {
				// Step 2: Create and start container
				const containerConfig: ContainerConfig = {
					tenantId: validatedConfig.tenantId,
					subdomain: validatedConfig.subdomain,
					databaseUrl: database.connectionString,
					image: this.config.frescoImage,
					memory: validatedConfig.memory || this.config.defaultMemory,
					cpus: validatedConfig.cpus || this.config.defaultCpus,
					environmentVars: validatedConfig.environmentVars,
				};

				const containerId = await this.containerManager.createContainer(containerConfig);

				return {
					tenantId: validatedConfig.tenantId,
					containerId,
					database,
					subdomain: validatedConfig.subdomain,
					status: "success",
				};
			} catch (containerError) {
				// If container creation fails, clean up the database schema
				await this.schemaManager.dropTenantSchema(validatedConfig.tenantId);
				throw containerError;
			}
		} catch (error) {
			return {
				tenantId: validatedConfig.tenantId,
				containerId: "",
				database: {
					schemaName: "",
					username: "",
					password: "",
					connectionString: "",
				},
				subdomain: validatedConfig.subdomain,
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Deprovision a tenant (removes container and schema)
	 */
	async deprovisionTenant(tenantId: string): Promise<void> {
		// Get container info first
		const containers = await this.containerManager.listContainers();
		const container = containers.find((c) => c.Labels["fresco.tenant.id"] === tenantId);

		// Remove container if it exists
		if (container) {
			await this.containerManager.removeContainer(container.Id);
		}

		// Drop database schema
		await this.schemaManager.dropTenantSchema(tenantId);
	}

	/**
	 * Start a tenant's container
	 */
	async startTenant(tenantId: string): Promise<void> {
		const containers = await this.containerManager.listContainers();
		const container = containers.find((c) => c.Labels["fresco.tenant.id"] === tenantId);

		if (!container) {
			throw new Error(`No container found for tenant ${tenantId}`);
		}

		await this.containerManager.startContainer(container.Id);
	}

	/**
	 * Stop a tenant's container
	 */
	async stopTenant(tenantId: string): Promise<void> {
		const containers = await this.containerManager.listContainers();
		const container = containers.find((c) => c.Labels["fresco.tenant.id"] === tenantId);

		if (!container) {
			throw new Error(`No container found for tenant ${tenantId}`);
		}

		await this.containerManager.stopContainer(container.Id);
	}

	/**
	 * Restart a tenant's container
	 */
	async restartTenant(tenantId: string): Promise<void> {
		const containers = await this.containerManager.listContainers();
		const container = containers.find((c) => c.Labels["fresco.tenant.id"] === tenantId);

		if (!container) {
			throw new Error(`No container found for tenant ${tenantId}`);
		}

		await this.containerManager.restartContainer(container.Id);
	}

	/**
	 * Get tenant metrics
	 */
	async getTenantMetrics(tenantId: string): Promise<TenantMetrics | null> {
		return this.metricsCollector.getTenantMetrics(tenantId);
	}

	/**
	 * Get tenant logs
	 */
	async getTenantLogs(tenantId: string, lines = 100, since?: number): Promise<string> {
		const containers = await this.containerManager.listContainers();
		const container = containers.find((c) => c.Labels["fresco.tenant.id"] === tenantId);

		if (!container) {
			throw new Error(`No container found for tenant ${tenantId}`);
		}

		return this.containerManager.getContainerLogs(container.Id, lines, since);
	}

	/**
	 * List all tenants
	 */
	async listTenants(): Promise<
		Array<{
			tenantId: string;
			subdomain: string;
			status: "running" | "stopped";
			containerId: string;
		}>
	> {
		const containers = await this.containerManager.listContainers();

		return containers
			.filter((c) => c.Labels["fresco.tenant.id"] && c.Labels["fresco.tenant.subdomain"])
			.map((c) => ({
				tenantId: c.Labels["fresco.tenant.id"] as string,
				subdomain: c.Labels["fresco.tenant.subdomain"] as string,
				status: c.State === "running" ? ("running" as const) : ("stopped" as const),
				containerId: c.Id,
			}));
	}

	/**
	 * Health check for all services
	 */
	async healthCheck(): Promise<{
		docker: boolean;
		database: boolean;
		overall: boolean;
	}> {
		const [dockerHealth, databaseHealth] = await Promise.all([
			this.containerManager.healthCheck(),
			this.schemaManager.healthCheck(),
		]);

		return {
			docker: dockerHealth,
			database: databaseHealth,
			overall: dockerHealth && databaseHealth,
		};
	}

	/**
	 * Get system metrics
	 */
	async getSystemMetrics() {
		return this.metricsCollector.collectMetrics();
	}

	/**
	 * Start periodic metrics collection
	 */
	startMetricsCollection(intervalMs = 60000): () => void {
		return this.metricsCollector.startPeriodicCollection(intervalMs);
	}

	/**
	 * Check for resource alerts
	 */
	checkResourceAlerts(cpuThreshold = 80, memoryThreshold = 80) {
		return this.metricsCollector.checkAlerts(cpuThreshold, memoryThreshold);
	}
}
