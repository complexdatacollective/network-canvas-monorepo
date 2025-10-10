import type { SchemaManager } from "../database/schema-manager.js";
import type { ContainerManager } from "../docker/container-manager.js";

export interface SystemMetrics {
	timestamp: Date;
	docker: {
		healthy: boolean;
		containerCount: number;
		runningContainers: number;
		stoppedContainers: number;
	};
	database: {
		healthy: boolean;
		schemaCount: number;
		totalConnections?: number;
	};
	tenants: TenantMetrics[];
}

export interface TenantMetrics {
	tenantId: string;
	containerId?: string;
	status: "running" | "stopped" | "error";
	resources?: {
		cpu: number;
		memoryUsage: number;
		memoryLimit: number;
		memoryPercent: number;
		networkRx: number;
		networkTx: number;
	};
	database?: {
		tableCount: number;
		totalSize: string;
		rowCount: number;
	};
}

export class MetricsCollector {
	private containerManager: ContainerManager;
	private schemaManager: SchemaManager;
	private metricsHistory: SystemMetrics[] = [];
	private maxHistorySize = 100;

	constructor(containerManager: ContainerManager, schemaManager: SchemaManager) {
		this.containerManager = containerManager;
		this.schemaManager = schemaManager;
	}

	/**
	 * Collect current system metrics
	 */
	async collectMetrics(): Promise<SystemMetrics> {
		const [dockerHealth, databaseHealth, containers, schemas] = await Promise.all([
			this.containerManager.healthCheck(),
			this.schemaManager.healthCheck(),
			this.containerManager.listContainers(),
			this.schemaManager.listTenantSchemas(),
		]);

		// Collect per-tenant metrics
		const tenantMetrics: TenantMetrics[] = [];

		for (const container of containers) {
			const tenantId = container.Labels["fresco.tenant.id"];
			if (!tenantId) continue;

			const metrics: TenantMetrics = {
				tenantId,
				containerId: container.Id,
				status: container.State === "running" ? "running" : "stopped",
			};

			// Get resource stats for running containers
			if (container.State === "running") {
				try {
					const stats = await this.containerManager.getContainerStats(container.Id);
					metrics.resources = {
						cpu: stats.cpuPercent,
						memoryUsage: stats.memoryUsage,
						memoryLimit: stats.memoryLimit,
						memoryPercent: stats.memoryPercent,
						networkRx: stats.networkRx,
						networkTx: stats.networkTx,
					};
				} catch (_error) {}
			}

			// Get database stats
			try {
				const dbStats = await this.schemaManager.getSchemaStats(tenantId);
				metrics.database = dbStats;
			} catch (_error) {}

			tenantMetrics.push(metrics);
		}

		const systemMetrics: SystemMetrics = {
			timestamp: new Date(),
			docker: {
				healthy: dockerHealth,
				containerCount: containers.length,
				runningContainers: containers.filter((c) => c.State === "running").length,
				stoppedContainers: containers.filter((c) => c.State !== "running").length,
			},
			database: {
				healthy: databaseHealth,
				schemaCount: schemas.length,
			},
			tenants: tenantMetrics,
		};

		// Store in history
		this.addToHistory(systemMetrics);

		return systemMetrics;
	}

	/**
	 * Get metrics for a specific tenant
	 */
	async getTenantMetrics(tenantId: string): Promise<TenantMetrics | null> {
		const containers = await this.containerManager.listContainers();
		const container = containers.find((c) => c.Labels["fresco.tenant.id"] === tenantId);

		if (!container) {
			return null;
		}

		const metrics: TenantMetrics = {
			tenantId,
			containerId: container.Id,
			status: container.State === "running" ? "running" : "stopped",
		};

		// Get resource stats for running containers
		if (container.State === "running") {
			try {
				const stats = await this.containerManager.getContainerStats(container.Id);
				metrics.resources = {
					cpu: stats.cpuPercent,
					memoryUsage: stats.memoryUsage,
					memoryLimit: stats.memoryLimit,
					memoryPercent: stats.memoryPercent,
					networkRx: stats.networkRx,
					networkTx: stats.networkTx,
				};
			} catch (_error) {}
		}

		// Get database stats
		try {
			const dbStats = await this.schemaManager.getSchemaStats(tenantId);
			metrics.database = dbStats;
		} catch (_error) {}

		return metrics;
	}

	/**
	 * Get historical metrics
	 */
	getHistory(limit?: number): SystemMetrics[] {
		if (limit) {
			return this.metricsHistory.slice(-limit);
		}
		return [...this.metricsHistory];
	}

	/**
	 * Clear metrics history
	 */
	clearHistory(): void {
		this.metricsHistory = [];
	}

	/**
	 * Get aggregated metrics over a time period
	 */
	getAggregatedMetrics(
		startTime: Date,
		endTime: Date = new Date(),
	): {
		avgCpu: number;
		avgMemory: number;
		maxCpu: number;
		maxMemory: number;
		totalNetworkRx: number;
		totalNetworkTx: number;
	} | null {
		const relevantMetrics = this.metricsHistory.filter((m) => m.timestamp >= startTime && m.timestamp <= endTime);

		if (relevantMetrics.length === 0) {
			return null;
		}

		let totalCpu = 0;
		let totalMemory = 0;
		let maxCpu = 0;
		let maxMemory = 0;
		let totalNetworkRx = 0;
		let totalNetworkTx = 0;
		let count = 0;

		for (const metric of relevantMetrics) {
			for (const tenant of metric.tenants) {
				if (tenant.resources) {
					totalCpu += tenant.resources.cpu;
					totalMemory += tenant.resources.memoryPercent;
					maxCpu = Math.max(maxCpu, tenant.resources.cpu);
					maxMemory = Math.max(maxMemory, tenant.resources.memoryPercent);
					totalNetworkRx += tenant.resources.networkRx;
					totalNetworkTx += tenant.resources.networkTx;
					count++;
				}
			}
		}

		return {
			avgCpu: count > 0 ? totalCpu / count : 0,
			avgMemory: count > 0 ? totalMemory / count : 0,
			maxCpu,
			maxMemory,
			totalNetworkRx,
			totalNetworkTx,
		};
	}

	/**
	 * Check for resource alerts
	 */
	checkAlerts(
		cpuThreshold = 80,
		memoryThreshold = 80,
	): Array<{
		tenantId: string;
		type: "cpu" | "memory";
		value: number;
		threshold: number;
	}> {
		const alerts: Array<{
			tenantId: string;
			type: "cpu" | "memory";
			value: number;
			threshold: number;
		}> = [];
		const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];

		if (!latestMetrics) {
			return alerts;
		}

		for (const tenant of latestMetrics.tenants) {
			if (tenant.resources) {
				if (tenant.resources.cpu > cpuThreshold) {
					alerts.push({
						tenantId: tenant.tenantId,
						type: "cpu" as const,
						value: tenant.resources.cpu,
						threshold: cpuThreshold,
					});
				}

				if (tenant.resources.memoryPercent > memoryThreshold) {
					alerts.push({
						tenantId: tenant.tenantId,
						type: "memory" as const,
						value: tenant.resources.memoryPercent,
						threshold: memoryThreshold,
					});
				}
			}
		}

		return alerts;
	}

	/**
	 * Add metrics to history
	 */
	private addToHistory(metrics: SystemMetrics): void {
		this.metricsHistory.push(metrics);

		// Trim history if it exceeds max size
		if (this.metricsHistory.length > this.maxHistorySize) {
			this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
		}
	}

	/**
	 * Start periodic metrics collection
	 */
	startPeriodicCollection(intervalMs = 60000): () => void {
		const intervalId = setInterval(async () => {
			try {
				await this.collectMetrics();
			} catch (_error) {}
		}, intervalMs);

		// Return cleanup function
		return () => clearInterval(intervalId);
	}
}
