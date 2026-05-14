import Button from "@codaco/fresco-ui/Button";
import type { ExportEvent } from "@codaco/network-exporters/events";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import ProgressDialog from "../components/ProgressDialog";
import { runExport } from "../exports/run-export";
import { db, type InterviewRecord, type ProtocolRecord } from "../lib/db";
import { formatDate } from "../lib/format";
import { platform } from "../platform";

type ExportProgress =
	| { kind: "idle" }
	| { kind: "running"; stage: string; message: string; progress?: { current: number; total: number } }
	| { kind: "success"; message: string; path?: string }
	| { kind: "error"; message: string };

export default function ExportPage() {
	const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
	const [protocols, setProtocols] = useState<Map<string, ProtocolRecord>>(new Map());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [csv, setCsv] = useState(true);
	const [graphml, setGraphml] = useState(true);
	const [useScreenLayout, setUseScreenLayout] = useState(true);
	const [progress, setProgress] = useState<ExportProgress>({ kind: "idle" });

	useEffect(() => {
		(async () => {
			const [list, protos] = await Promise.all([
				db.interviews.orderBy("lastUpdated").reverse().toArray(),
				db.protocols.toArray(),
			]);
			setInterviews(list);
			setProtocols(new Map(protos.map((p) => [p.id, p])));
		})();
	}, []);

	const completedCount = useMemo(() => interviews.filter((i) => i.finishTime).length, [interviews]);

	const toggle = useCallback((id: string) => {
		setSelected((curr) => {
			const next = new Set(curr);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleAll = useCallback(() => {
		setSelected((curr) => {
			if (curr.size === interviews.length) return new Set();
			return new Set(interviews.map((i) => i.id));
		});
	}, [interviews]);

	const onExport = useCallback(async () => {
		if (selected.size === 0 || (!csv && !graphml)) return;
		const ids = Array.from(selected);
		setProgress({ kind: "running", stage: "starting", message: "Preparing export…" });

		const onProgress = (ev: ExportEvent) => {
			if (ev.type === "stage") {
				setProgress({ kind: "running", stage: ev.stage, message: ev.message });
			} else {
				setProgress((curr) =>
					curr.kind === "running" ? { ...curr, progress: { current: ev.current, total: ev.total } } : curr,
				);
			}
		};

		try {
			const { bytes, fileName, result } = await runExport({
				interviewIds: ids,
				formats: { csv, graphml },
				useScreenLayoutCoordinates: useScreenLayout,
				screenLayoutWidth: 1920,
				screenLayoutHeight: 1080,
				onProgress,
			});
			const save = await platform.saveExport(fileName, bytes);
			const failureCount = result.failedExports.length;
			const message =
				failureCount > 0
					? `Saved ${result.successfulExports.length} files, ${failureCount} failed.`
					: `Exported ${result.successfulExports.length} files.`;
			setProgress({ kind: "success", message, path: save.path });
		} catch (err) {
			setProgress({
				kind: "error",
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}, [csv, graphml, selected, useScreenLayout]);

	return (
		<>
			<PageHeader
				title="Export"
				subtitle={`Bundle interview data into a ZIP file. ${completedCount} completed interviews available.`}
				actions={
					<Button icon={<Download size={16} />} onClick={onExport} disabled={selected.size === 0 || (!csv && !graphml)}>
						Export selection
					</Button>
				}
			/>

			<section className="mb-6 rounded-md border border-border bg-surface-1 p-5">
				<h2 className="mb-3 font-heading text-lg font-semibold">Export options</h2>
				<div className="flex flex-wrap gap-6 text-sm">
					<label className="flex items-center gap-2">
						<input type="checkbox" checked={csv} onChange={(e) => setCsv(e.target.checked)} />
						CSV (attribute, edge, ego, adjacency)
					</label>
					<label className="flex items-center gap-2">
						<input type="checkbox" checked={graphml} onChange={(e) => setGraphml(e.target.checked)} />
						GraphML
					</label>
					<label className="flex items-center gap-2">
						<input type="checkbox" checked={useScreenLayout} onChange={(e) => setUseScreenLayout(e.target.checked)} />
						Use screen-layout coordinates
					</label>
				</div>
			</section>

			{interviews.length === 0 ? (
				<EmptyState
					title="No interviews to export"
					description="Run at least one interview before exporting."
					icon={<Download size={36} />}
				/>
			) : (
				<div className="overflow-hidden rounded-md border border-border bg-surface-1">
					<table className="w-full text-sm">
						<thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
							<tr>
								<th className="w-10 px-4 py-3">
									<input
										type="checkbox"
										checked={selected.size === interviews.length && interviews.length > 0}
										onChange={toggleAll}
										aria-label="Select all"
									/>
								</th>
								<th className="px-4 py-3">Participant</th>
								<th className="px-4 py-3">Protocol</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Updated</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{interviews.map((row) => (
								<tr key={row.id} className="hover:bg-platinum/40">
									<td className="px-4 py-3">
										<input
											type="checkbox"
											checked={selected.has(row.id)}
											onChange={() => toggle(row.id)}
											aria-label={`Select ${row.participantIdentifier}`}
										/>
									</td>
									<td className="px-4 py-3 font-medium">{row.participantIdentifier}</td>
									<td className="px-4 py-3 text-muted-foreground">
										{protocols.get(row.protocolId)?.name ?? "Unknown"}
									</td>
									<td className="px-4 py-3 text-muted-foreground">{row.finishTime ? "Completed" : "In progress"}</td>
									<td className="px-4 py-3 text-muted-foreground">{formatDate(row.lastUpdated)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<ProgressDialog
				open={progress.kind === "running"}
				title="Exporting…"
				message={progress.kind === "running" ? progress.message : undefined}
				progress={progress.kind === "running" ? progress.progress : undefined}
			/>

			{progress.kind === "success" ? (
				<div className="mt-4 rounded-md border border-success/40 bg-success/10 p-4 text-sm text-success">
					<strong className="block font-semibold">Export complete</strong>
					<span>{progress.message}</span>
					{progress.path ? <div className="mt-1 text-xs">Saved to: {progress.path}</div> : null}
					<button
						type="button"
						className="ml-3 text-xs font-semibold underline"
						onClick={() => setProgress({ kind: "idle" })}
					>
						Dismiss
					</button>
				</div>
			) : null}

			{progress.kind === "error" ? (
				<div className="mt-4 rounded-md border border-error/40 bg-error/10 p-4 text-sm text-error">
					<strong className="block font-semibold">Export failed</strong>
					<span>{progress.message}</span>
					<button
						type="button"
						className="ml-3 text-xs font-semibold underline"
						onClick={() => setProgress({ kind: "idle" })}
					>
						Dismiss
					</button>
				</div>
			) : null}
		</>
	);
}
