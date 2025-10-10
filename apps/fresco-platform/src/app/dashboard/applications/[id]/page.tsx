"use client";

import { Button } from "@codaco/ui";
import { formatDistanceToNow } from "date-fns";
import {
	Activity,
	ArrowLeft,
	Check,
	Clock,
	Copy,
	ExternalLink,
	HardDrive,
	Network,
	Play,
	RotateCw,
	Square,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ConfirmDialog } from "../../../../components/dashboard/confirm-dialog";
import { LoadingSpinner } from "../../../../components/dashboard/loading-spinner";
import { MetricsCard } from "../../../../components/dashboard/metrics-card";
import { ResourceUsageChart } from "../../../../components/dashboard/resource-usage-chart";
import { StatusBadge } from "../../../../components/dashboard/status-badge";
import {
	useDestroyTenant,
	useRestartTenant,
	useStartTenant,
	useStopTenant,
	useTenant,
	useTenantMetrics,
} from "../../../../hooks/use-tenants";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default function ApplicationDetailsPage({ params }: PageProps) {
	const { id } = use(params);
	const router = useRouter();
	const [copiedUrl, setCopiedUrl] = useState(false);
	const [confirmDialog, setConfirmDialog] = useState(false);

	const { data: tenant, isLoading: tenantLoading } = useTenant(id);
	const { data: metrics, isLoading: metricsLoading } = useTenantMetrics(id, 5000);

	const startTenant = useStartTenant();
	const stopTenant = useStopTenant();
	const restartTenant = useRestartTenant();
	const destroyTenant = useDestroyTenant();

	const handleCopyUrl = async () => {
		if (tenant) {
			await navigator.clipboard.writeText(`https://${tenant.subdomain}.example.com`);
			setCopiedUrl(true);
			setTimeout(() => setCopiedUrl(false), 2000);
		}
	};

	const handleDestroy = async () => {
		await destroyTenant.mutateAsync(id);
		router.push("/dashboard");
	};

	const formatUptime = (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${hours}h ${minutes}m`;
	};

	const formatBytes = (bytes: number) => {
		return (bytes / (1024 * 1024)).toFixed(2);
	};

	if (tenantLoading) {
		return <LoadingSpinner fullScreen text="Loading application details..." />;
	}

	if (!tenant) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<h2 className="text-2xl font-semibold text-gray-900">Application not found</h2>
					<p className="mt-2 text-gray-600">The application you are looking for does not exist.</p>
					<Button asChild className="mt-4">
						<Link href="/dashboard">Back to Applications</Link>
					</Button>
				</div>
			</div>
		);
	}

	const isRunning = tenant.containerStatus === "running";
	const isStopped = tenant.status === "STOPPED" || tenant.containerStatus === "stopped";
	const hasError = tenant.status === "ERROR";

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-6">
				<Button variant="ghost" asChild>
					<Link href="/dashboard">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Applications
					</Link>
				</Button>
			</div>

			<div className="mb-8 flex items-start justify-between">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">{tenant.subdomain}</h1>
					<p className="mt-1 text-sm text-gray-500">
						Created {formatDistanceToNow(new Date(tenant.createdAt), { addSuffix: true })}
					</p>
				</div>

				<div className="flex items-center gap-3">
					<StatusBadge status={tenant.status} />
					<Button size="sm" variant="outline" onClick={() => startTenant.mutate(id)} disabled={isRunning || hasError}>
						<Play className="mr-1 h-4 w-4" />
						Start
					</Button>
					<Button size="sm" variant="outline" onClick={() => stopTenant.mutate(id)} disabled={isStopped || hasError}>
						<Square className="mr-1 h-4 w-4" />
						Stop
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => restartTenant.mutate(id)}
						disabled={!isRunning || hasError}
					>
						<RotateCw className="mr-1 h-4 w-4" />
						Restart
					</Button>
					<Button size="sm" variant="destructive" onClick={() => setConfirmDialog(true)}>
						<Trash2 className="mr-1 h-4 w-4" />
						Destroy
					</Button>
				</div>
			</div>

			<div className="mb-8 rounded-lg border bg-white p-6">
				<h2 className="mb-4 text-lg font-semibold text-gray-900">Access Information</h2>
				<div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
					<div className="flex-1">
						<p className="text-sm font-medium text-gray-500">Application URL</p>
						<p className="mt-1 font-mono text-lg text-gray-900">https://{tenant.subdomain}.example.com</p>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={handleCopyUrl}>
							{copiedUrl ? (
								<>
									<Check className="mr-1 h-4 w-4" />
									Copied
								</>
							) : (
								<>
									<Copy className="mr-1 h-4 w-4" />
									Copy
								</>
							)}
						</Button>
						{isRunning && (
							<Button variant="outline" size="sm" asChild>
								<a href={`https://${tenant.subdomain}.example.com`} target="_blank" rel="noopener noreferrer">
									<ExternalLink className="mr-1 h-4 w-4" />
									Open
								</a>
							</Button>
						)}
					</div>
				</div>
			</div>

			<div className="mb-8">
				<h2 className="mb-4 text-lg font-semibold text-gray-900">Resource Usage</h2>
				{metricsLoading && <LoadingSpinner text="Loading metrics..." />}
				{!metricsLoading && metrics && (
					<>
						<div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<MetricsCard
								title="CPU Usage"
								value={metrics.cpuUsage.toFixed(1)}
								unit="%"
								color={metrics.cpuUsage > 80 ? "red" : metrics.cpuUsage > 60 ? "yellow" : "green"}
							/>
							<MetricsCard
								title="Memory Usage"
								value={formatBytes(metrics.memoryUsage)}
								unit="MB"
								description={`of ${formatBytes(metrics.memoryLimit)} MB`}
								color={
									metrics.memoryUsage / metrics.memoryLimit > 0.8
										? "red"
										: metrics.memoryUsage / metrics.memoryLimit > 0.6
											? "yellow"
											: "blue"
								}
							/>
							<MetricsCard title="Network In" value={formatBytes(metrics.networkRx)} unit="MB" color="purple" />
							<MetricsCard title="Network Out" value={formatBytes(metrics.networkTx)} unit="MB" color="purple" />
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<ResourceUsageChart title="CPU Usage" current={metrics.cpuUsage} max={100} unit="%" color="green" />
							<ResourceUsageChart
								title="Memory Usage"
								current={metrics.memoryUsage}
								max={metrics.memoryLimit}
								unit="MB"
								color="blue"
							/>
						</div>

						{metrics.uptime > 0 && (
							<div className="mt-6 rounded-lg border bg-white p-4">
								<div className="flex items-center gap-2">
									<Clock className="h-5 w-5 text-gray-400" />
									<span className="text-sm text-gray-600">
										Uptime: <span className="font-semibold text-gray-900">{formatUptime(metrics.uptime)}</span>
									</span>
								</div>
							</div>
						)}
					</>
				)}
			</div>

			<div className="rounded-lg border bg-white p-6">
				<h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<Button variant="outline" asChild className="justify-start">
						<Link href={`/dashboard/applications/${id}/logs`}>
							<Activity className="mr-2 h-4 w-4" />
							View Logs
						</Link>
					</Button>
					<Button variant="outline" disabled className="justify-start">
						<HardDrive className="mr-2 h-4 w-4" />
						Environment Variables
					</Button>
					<Button variant="outline" disabled className="justify-start">
						<Network className="mr-2 h-4 w-4" />
						Custom Domain
					</Button>
				</div>
			</div>

			<ConfirmDialog
				isOpen={confirmDialog}
				onClose={() => setConfirmDialog(false)}
				onConfirm={handleDestroy}
				title="Destroy Application"
				description={`Are you sure you want to destroy "${tenant.subdomain}"? This action cannot be undone and all data will be permanently deleted.`}
				confirmText="Destroy"
				requiresTypedConfirmation
				confirmationWord="DELETE"
				variant="danger"
				isLoading={destroyTenant.isPending}
			/>
		</div>
	);
}
