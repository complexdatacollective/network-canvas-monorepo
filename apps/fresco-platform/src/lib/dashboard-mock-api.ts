import type { LogEntry, PaginatedResponse, Tenant, TenantMetrics } from "./dashboard-types";
import { orpcClient } from "./orpc-client";

export const dashboardApi = {
	listTenants: async (page = 1, limit = 10): Promise<PaginatedResponse<Tenant>> => {
		const result = await orpcClient.tenants.list({ page, limit });

		return {
			data: result.tenants.map((tenant: any) => ({
				id: tenant.id,
				subdomain: tenant.subdomain,
				status: tenant.status,
				containerStatus: tenant.containerStatus,
				createdAt: new Date(tenant.createdAt),
				stoppedAt: tenant.stoppedAt ? new Date(tenant.stoppedAt) : undefined,
				deploymentLogs: tenant.deploymentLogs.map((log: any) => ({
					id: log.id,
					action: log.action,
					status: log.status,
					createdAt: new Date(log.createdAt),
					errorMessage: log.errorMessage || undefined,
				})),
			})),
			total: result.total,
			pages: result.pages,
			currentPage: result.currentPage,
		};
	},

	getTenant: async (id: string): Promise<Tenant> => {
		const tenant = await orpcClient.tenants.get({ tenantId: id });

		return {
			id: tenant.id,
			subdomain: tenant.subdomain,
			status: tenant.status,
			containerStatus: tenant.metrics?.status || "unknown",
			createdAt: new Date(tenant.createdAt),
			stoppedAt: tenant.stoppedAt ? new Date(tenant.stoppedAt) : undefined,
			deploymentLogs: tenant.deploymentLogs.map((log: any) => ({
				id: log.id,
				action: log.action,
				status: log.status,
				createdAt: new Date(log.createdAt),
				errorMessage: log.errorMessage || undefined,
			})),
		};
	},

	startTenant: async (id: string): Promise<void> => {
		await orpcClient.tenants.start({ tenantId: id });
	},

	stopTenant: async (id: string): Promise<void> => {
		await orpcClient.tenants.stop({ tenantId: id });
	},

	restartTenant: async (id: string): Promise<void> => {
		await orpcClient.tenants.restart({ tenantId: id });
	},

	destroyTenant: async (id: string): Promise<void> => {
		await orpcClient.tenants.destroy({ tenantId: id, confirmation: "DELETE" });
	},

	getTenantMetrics: async (id: string): Promise<TenantMetrics> => {
		const metrics = await orpcClient.tenants.getMetrics({ tenantId: id });

		return {
			status: metrics.status,
			cpuUsage: metrics.cpuUsage || 0,
			memoryUsage: metrics.memoryUsage || 0,
			memoryLimit: metrics.memoryLimit || 512,
			networkRx: metrics.networkRx || 0,
			networkTx: metrics.networkTx || 0,
			uptime: metrics.uptime || 0,
		};
	},

	getTenantLogs: async (id: string, lines = 100): Promise<LogEntry[]> => {
		const result = await orpcClient.tenants.getLogs({ tenantId: id, lines });

		return result.logs.map((log: any) => ({
			timestamp: log.timestamp,
			level: log.level as "info" | "warn" | "error" | "debug",
			message: log.message,
		}));
	},
};
