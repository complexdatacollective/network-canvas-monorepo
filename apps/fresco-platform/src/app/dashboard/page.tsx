"use client";

import { Button, Input } from "@codaco/ui";
import { Grid, List, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "../../components/dashboard/confirm-dialog";
import { EmptyState } from "../../components/dashboard/empty-state";
import { LoadingSpinner } from "../../components/dashboard/loading-spinner";
import { TenantCard } from "../../components/dashboard/tenant-card";
import { useDestroyTenant, useRestartTenant, useStartTenant, useStopTenant, useTenants } from "../../hooks/use-tenants";

export default function DashboardPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [page] = useState(1);
	const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; tenantId: string; tenantName: string }>({
		isOpen: false,
		tenantId: "",
		tenantName: "",
	});

	const { data, isLoading } = useTenants(page, 10);
	const startTenant = useStartTenant();
	const stopTenant = useStopTenant();
	const restartTenant = useRestartTenant();
	const destroyTenant = useDestroyTenant();

	const filteredTenants = data?.data.filter((tenant) =>
		tenant.subdomain.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const handleDestroy = async () => {
		await destroyTenant.mutateAsync(confirmDialog.tenantId);
		setConfirmDialog({ isOpen: false, tenantId: "", tenantName: "" });
	};

	if (isLoading) {
		return <LoadingSpinner fullScreen text="Loading applications..." />;
	}

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Applications</h1>
					<p className="mt-1 text-sm text-gray-500">Manage your Fresco instances</p>
				</div>

				<Button asChild>
					<Link href="/signup">
						<Plus className="mr-2 h-4 w-4" />
						New Application
					</Link>
				</Button>
			</div>

			{data?.data && data.data.length > 0 ? (
				<>
					<div className="mb-6 flex items-center gap-4">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
							<Input
								type="text"
								placeholder="Search applications..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-10"
							/>
						</div>

						<div className="flex gap-1 rounded-lg border bg-white p-1">
							<Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("grid")}>
								<Grid className="h-4 w-4" />
							</Button>
							<Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")}>
								<List className="h-4 w-4" />
							</Button>
						</div>
					</div>

					<div className={viewMode === "grid" ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-4"}>
						{filteredTenants?.map((tenant) => (
							<TenantCard
								key={tenant.id}
								tenant={tenant}
								onStart={(id) => startTenant.mutate(id)}
								onStop={(id) => stopTenant.mutate(id)}
								onRestart={(id) => restartTenant.mutate(id)}
								onDestroy={(id) =>
									setConfirmDialog({
										isOpen: true,
										tenantId: id,
										tenantName: tenant.subdomain,
									})
								}
							/>
						))}
					</div>

					{filteredTenants?.length === 0 && (
						<div className="mt-8">
							<EmptyState icon={Search} title="No applications found" description="Try adjusting your search query" />
						</div>
					)}
				</>
			) : (
				<EmptyState
					icon={Plus}
					title="No applications yet"
					description="Get started by creating your first Fresco instance"
					action={{
						label: "Create Application",
						onClick: () => (window.location.href = "/signup"),
					}}
				/>
			)}

			<ConfirmDialog
				isOpen={confirmDialog.isOpen}
				onClose={() => setConfirmDialog({ isOpen: false, tenantId: "", tenantName: "" })}
				onConfirm={handleDestroy}
				title="Destroy Application"
				description={`Are you sure you want to destroy "${confirmDialog.tenantName}"? This action cannot be undone and all data will be permanently deleted.`}
				confirmText="Destroy"
				requiresTypedConfirmation
				confirmationWord="DELETE"
				variant="danger"
				isLoading={destroyTenant.isPending}
			/>
		</div>
	);
}
