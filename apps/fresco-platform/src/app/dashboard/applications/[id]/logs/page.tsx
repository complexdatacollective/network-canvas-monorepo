"use client";

import { Button, cn, Input } from "@codaco/ui";
import { ArrowLeft, Download, Filter, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "../../../../../components/dashboard/loading-spinner";
import { useTenant, useTenantLogs } from "../../../../../hooks/use-tenants";
import type { LogEntry } from "../../../../../lib/dashboard-types";

type PageProps = {
	params: Promise<{ id: string }>;
};

const logLevelColors = {
	info: "text-blue-600 bg-blue-50",
	warn: "text-yellow-600 bg-yellow-50",
	error: "text-red-600 bg-red-50",
	debug: "text-gray-600 bg-gray-50",
};

export default function LogsPage({ params }: PageProps) {
	const { id } = use(params);
	const _router = useRouter();
	const logsEndRef = useRef<HTMLDivElement>(null);

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLevel, setSelectedLevel] = useState<string>("all");
	const [autoScroll, setAutoScroll] = useState(true);

	const { data: tenant, isLoading: tenantLoading } = useTenant(id);
	const { data: logs, isLoading: logsLoading, refetch } = useTenantLogs(id, 100);

	useEffect(() => {
		if (autoScroll && logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [logs, autoScroll]);

	const filteredLogs = logs?.filter((log: LogEntry) => {
		const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesLevel = selectedLevel === "all" || log.level === selectedLevel;
		return matchesSearch && matchesLevel;
	});

	const handleExport = () => {
		if (!logs) return;

		const content = logs
			.map((log: LogEntry) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
			.join("\n");

		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${tenant?.subdomain}-logs-${new Date().toISOString()}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	if (tenantLoading) {
		return <LoadingSpinner fullScreen text="Loading logs..." />;
	}

	if (!tenant) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<h2 className="text-2xl font-semibold text-gray-900">Application not found</h2>
					<Button asChild className="mt-4">
						<Link href="/dashboard">Back to Applications</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-6">
				<Button variant="ghost" asChild>
					<Link href={`/dashboard/applications/${id}`}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Application
					</Link>
				</Button>
			</div>

			<div className="mb-6 flex items-start justify-between">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Application Logs</h1>
					<p className="mt-1 text-sm text-gray-500">{tenant.subdomain}</p>
				</div>

				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => refetch()}>
						<RefreshCw className="mr-1 h-4 w-4" />
						Refresh
					</Button>
					<Button variant="outline" size="sm" onClick={handleExport} disabled={!logs || logs.length === 0}>
						<Download className="mr-1 h-4 w-4" />
						Export
					</Button>
				</div>
			</div>

			<div className="mb-4 flex flex-wrap items-center gap-4">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<Input
						type="text"
						placeholder="Search logs..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Filter className="h-4 w-4 text-gray-400" />
					<select
						value={selectedLevel}
						onChange={(e) => setSelectedLevel(e.target.value)}
						className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="all">All Levels</option>
						<option value="info">Info</option>
						<option value="warn">Warning</option>
						<option value="error">Error</option>
						<option value="debug">Debug</option>
					</select>
				</div>

				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={autoScroll}
						onChange={(e) => setAutoScroll(e.target.checked)}
						className="rounded border-gray-300 text-primary focus:ring-primary"
					/>
					Auto-scroll
				</label>
			</div>

			<div className="rounded-lg border bg-white">
				<div className="h-[600px] overflow-y-auto p-4 font-mono text-sm">
					{logsLoading && <LoadingSpinner text="Loading logs..." />}

					{!logsLoading && filteredLogs && filteredLogs.length > 0 ? (
						<div className="space-y-1">
							{filteredLogs.map((log: LogEntry, index: number) => (
								<div key={`${log.timestamp}-${index}`} className="flex gap-3 rounded px-2 py-1 hover:bg-gray-50">
									<span className="text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
									<span
										className={cn(
											"inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
											logLevelColors[log.level],
										)}
									>
										{log.level.toUpperCase()}
									</span>
									<span className="flex-1 text-gray-900">{log.message}</span>
								</div>
							))}
							<div ref={logsEndRef} />
						</div>
					) : (
						!logsLoading && (
							<div className="flex h-full items-center justify-center text-gray-500">
								{logs && logs.length === 0 ? "No logs available" : "No logs match your search"}
							</div>
						)
					)}
				</div>

				<div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
					{filteredLogs && `Showing ${filteredLogs.length} log entries`}
					{logs && filteredLogs && filteredLogs.length !== logs.length && ` (filtered from ${logs.length})`}
				</div>
			</div>
		</div>
	);
}
