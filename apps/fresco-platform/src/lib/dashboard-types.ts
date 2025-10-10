export type TenantStatus = "ACTIVE" | "STOPPED" | "DEPLOYING" | "DESTROYING" | "ERROR";

export type ContainerStatus = "running" | "stopped" | "unknown";

export type Tenant = {
	id: string;
	subdomain: string;
	status: TenantStatus;
	containerStatus?: ContainerStatus;
	createdAt: Date;
	stoppedAt?: Date | null;
	deploymentLogs?: DeploymentLog[];
};

export type DeploymentLog = {
	id: string;
	action: string;
	status: string;
	createdAt: Date;
	errorMessage?: string | null;
};

export type TenantMetrics = {
	status: ContainerStatus;
	cpuUsage: number;
	memoryUsage: number;
	memoryLimit: number;
	networkRx: number;
	networkTx: number;
	uptime: number;
};

export type LogEntry = {
	timestamp: string;
	level: "info" | "warn" | "error" | "debug";
	message: string;
};

export type PaginatedResponse<T> = {
	data: T[];
	total: number;
	pages: number;
	currentPage: number;
};
