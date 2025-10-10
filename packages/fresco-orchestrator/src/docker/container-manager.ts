import type { Container, ContainerCreateOptions } from "dockerode";
import Docker from "dockerode";
import { z } from "zod";

export const ContainerConfigSchema = z.object({
	tenantId: z.string().uuid(),
	subdomain: z.string(),
	databaseUrl: z.string().url(),
	image: z.string().default("ghcr.io/complexdatacollective/fresco:latest"),
	memory: z.number().default(512), // MB
	cpus: z.number().default(0.5),
	environmentVars: z.record(z.string(), z.string()).optional(),
});

export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;

export interface ContainerStats {
	cpuPercent: number;
	memoryUsage: number;
	memoryLimit: number;
	memoryPercent: number;
	networkRx: number;
	networkTx: number;
}

export class ContainerManager {
	private docker: Docker;
	private networkName: string;

	constructor(dockerHost?: string, networkName = "fresco-platform-network") {
		this.docker = new Docker({
			socketPath: dockerHost || "/var/run/docker.sock",
		});
		this.networkName = networkName;
	}

	/**
	 * Create and start a new container for a tenant
	 */
	async createContainer(config: ContainerConfig): Promise<string> {
		const containerName = `fresco_tenant_${config.tenantId}`;

		// Check if container already exists
		const existingContainer = await this.getContainer(containerName);
		if (existingContainer) {
			throw new Error(`Container ${containerName} already exists`);
		}

		// Ensure network exists
		await this.ensureNetwork();

		// Prepare environment variables
		const env = [
			`DATABASE_URL=${config.databaseUrl}`,
			`FRESCO_URL=https://${config.subdomain}.example.com`,
			"NODE_ENV=production",
			...Object.entries(config.environmentVars || {}).map(([key, value]) => `${key}=${value}`),
		];

		// Container configuration
		const createOptions: ContainerCreateOptions = {
			name: containerName,
			Image: config.image,
			Env: env,
			HostConfig: {
				Memory: config.memory * 1024 * 1024, // Convert MB to bytes
				MemorySwap: config.memory * 1024 * 1024 * 2, // 2x memory
				CpuQuota: Math.floor(config.cpus * 100000),
				CpuPeriod: 100000,
				RestartPolicy: {
					Name: "unless-stopped",
				},
				NetworkMode: this.networkName,
			},
			Labels: {
				"fresco.tenant.id": config.tenantId,
				"fresco.tenant.subdomain": config.subdomain,
				"traefik.enable": "true",
				[`traefik.http.routers.fresco_${config.tenantId}.rule`]: `Host(\`${config.subdomain}.example.com\`)`,
				[`traefik.http.routers.fresco_${config.tenantId}.tls`]: "true",
				[`traefik.http.routers.fresco_${config.tenantId}.tls.certresolver`]: "letsencrypt",
			},
		};

		// Pull the image first
		await this.pullImage(config.image);

		// Create and start the container
		const container = await this.docker.createContainer(createOptions);
		await container.start();

		return container.id;
	}

	/**
	 * Start a stopped container
	 */
	async startContainer(containerId: string): Promise<void> {
		const container = this.docker.getContainer(containerId);
		const info = await container.inspect();

		if (info.State.Running) {
			throw new Error("Container is already running");
		}

		await container.start();
	}

	/**
	 * Stop a running container
	 */
	async stopContainer(containerId: string): Promise<void> {
		const container = this.docker.getContainer(containerId);
		const info = await container.inspect();

		if (!info.State.Running) {
			throw new Error("Container is not running");
		}

		await container.stop({ t: 10 }); // 10 second timeout
	}

	/**
	 * Restart a container
	 */
	async restartContainer(containerId: string): Promise<void> {
		const container = this.docker.getContainer(containerId);
		await container.restart({ t: 10 });
	}

	/**
	 * Remove a container (must be stopped first)
	 */
	async removeContainer(containerId: string): Promise<void> {
		const container = this.docker.getContainer(containerId);
		const info = await container.inspect();

		if (info.State.Running) {
			await container.stop({ t: 10 });
		}

		await container.remove({ v: true }); // Also remove volumes
	}

	/**
	 * Get container statistics
	 */
	async getContainerStats(containerId: string): Promise<ContainerStats> {
		const container = this.docker.getContainer(containerId);
		const stream = await container.stats({ stream: false });

		// Calculate CPU percentage
		const cpuDelta = stream.cpu_stats.cpu_usage.total_usage - stream.precpu_stats.cpu_usage.total_usage;
		const systemDelta = stream.cpu_stats.system_cpu_usage - stream.precpu_stats.system_cpu_usage;
		const cpuPercent = (cpuDelta / systemDelta) * stream.cpu_stats.online_cpus * 100;

		// Calculate memory
		const memoryUsage = stream.memory_stats.usage;
		const memoryLimit = stream.memory_stats.limit;
		const memoryPercent = (memoryUsage / memoryLimit) * 100;

		// Network stats
		const networks = stream.networks || {};
		const networkRx = Object.values(networks).reduce(
			(sum: number, net: Record<string, unknown>) => sum + ((net.rx_bytes as number) || 0),
			0,
		);
		const networkTx = Object.values(networks).reduce(
			(sum: number, net: Record<string, unknown>) => sum + ((net.tx_bytes as number) || 0),
			0,
		);

		return {
			cpuPercent: Math.round(cpuPercent * 100) / 100,
			memoryUsage,
			memoryLimit,
			memoryPercent: Math.round(memoryPercent * 100) / 100,
			networkRx,
			networkTx,
		};
	}

	/**
	 * Get container logs
	 */
	async getContainerLogs(containerId: string, lines = 100, since?: number): Promise<string> {
		const container = this.docker.getContainer(containerId);
		const logs = await container.logs({
			stdout: true,
			stderr: true,
			tail: lines,
			timestamps: true,
			since: since || 0,
		});

		return logs.toString("utf-8");
	}

	/**
	 * List all tenant containers
	 */
	async listContainers(): Promise<Docker.ContainerInfo[]> {
		const containers = await this.docker.listContainers({
			all: true,
			filters: {
				label: ["fresco.tenant.id"],
			},
		});

		return containers;
	}

	/**
	 * Get a specific container by name or ID
	 */
	private async getContainer(nameOrId: string): Promise<Container | null> {
		try {
			const container = this.docker.getContainer(nameOrId);
			await container.inspect();
			return container;
		} catch {
			return null;
		}
	}

	/**
	 * Pull Docker image
	 */
	private async pullImage(image: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
				if (err) {
					reject(err);
					return;
				}

				// Wait for pull to complete
				// Using type assertion for modem which is not exposed in dockerode types
				const dockerWithModem = this.docker as Docker & {
					modem: { followProgress: (stream: NodeJS.ReadableStream, callback: (err: Error | null) => void) => void };
				};
				dockerWithModem.modem.followProgress(stream, (err: Error | null) => {
					if (err) {
						reject(err);
					} else {
						resolve(undefined);
					}
				});
			});
		});
	}

	/**
	 * Ensure Docker network exists
	 */
	private async ensureNetwork(): Promise<void> {
		try {
			await this.docker.getNetwork(this.networkName).inspect();
		} catch {
			// Network doesn't exist, create it
			await this.docker.createNetwork({
				Name: this.networkName,
				Driver: "bridge",
			});
		}
	}

	/**
	 * Health check for Docker daemon
	 */
	async healthCheck(): Promise<boolean> {
		try {
			await this.docker.ping();
			return true;
		} catch {
			return false;
		}
	}
}
