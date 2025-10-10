"use client";

import { Button } from "@codaco/ui";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Play, RotateCw, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Tenant } from "../../lib/dashboard-types";
import { StatusBadge } from "./status-badge";

type TenantCardProps = {
	tenant: Tenant;
	onStart: (id: string) => void;
	onStop: (id: string) => void;
	onRestart: (id: string) => void;
	onDestroy: (id: string) => void;
};

export function TenantCard({ tenant, onStart, onStop, onRestart, onDestroy }: TenantCardProps) {
	const isRunning = tenant.containerStatus === "running";
	const isStopped = tenant.status === "STOPPED" || tenant.containerStatus === "stopped";
	const hasError = tenant.status === "ERROR";

	return (
		<div className="rounded-lg border bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
			<div className="flex items-start justify-between">
				<div className="flex-1">
					<Link href={`/dashboard/applications/${tenant.id}`} className="group">
						<h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary">{tenant.subdomain}</h3>
					</Link>
					<p className="mt-1 text-sm text-gray-500">
						Created {formatDistanceToNow(new Date(tenant.createdAt), { addSuffix: true })}
					</p>
				</div>

				<StatusBadge status={tenant.status} />
			</div>

			<div className="mt-4 flex flex-wrap gap-2">
				<Button size="sm" variant="outline" onClick={() => onStart(tenant.id)} disabled={isRunning || hasError}>
					<Play className="mr-1 h-4 w-4" />
					Start
				</Button>

				<Button size="sm" variant="outline" onClick={() => onStop(tenant.id)} disabled={isStopped || hasError}>
					<Square className="mr-1 h-4 w-4" />
					Stop
				</Button>

				<Button size="sm" variant="outline" onClick={() => onRestart(tenant.id)} disabled={!isRunning || hasError}>
					<RotateCw className="mr-1 h-4 w-4" />
					Restart
				</Button>

				<Button size="sm" variant="outline" asChild>
					<Link href={`/dashboard/applications/${tenant.id}`}>View Details</Link>
				</Button>

				{isRunning && (
					<Button size="sm" variant="outline" asChild>
						<a href={`https://${tenant.subdomain}.example.com`} target="_blank" rel="noopener noreferrer">
							<ExternalLink className="mr-1 h-4 w-4" />
							Open
						</a>
					</Button>
				)}

				<Button size="sm" variant="destructive" onClick={() => onDestroy(tenant.id)}>
					<Trash2 className="mr-1 h-4 w-4" />
					Destroy
				</Button>
			</div>

			{hasError && tenant.deploymentLogs && tenant.deploymentLogs.length > 0 && (
				<div className="mt-4 rounded-md bg-red-50 p-3">
					<p className="text-sm text-red-800">{tenant.deploymentLogs[0]?.errorMessage || "An error occurred"}</p>
				</div>
			)}
		</div>
	);
}
