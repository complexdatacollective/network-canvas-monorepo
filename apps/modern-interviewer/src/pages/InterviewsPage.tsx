import Button from "@codaco/fresco-ui/Button";
import { ClipboardList, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import { db, type InterviewRecord, type ProtocolRecord } from "../lib/db";
import { formatDate } from "../lib/format";

type Row = InterviewRecord & { protocolName: string };

export default function InterviewsPage() {
	const [rows, setRows] = useState<Row[]>([]);
	const [filter, setFilter] = useState<"all" | "in-progress" | "completed">("all");

	const refresh = useCallback(async () => {
		const [interviews, protocols] = await Promise.all([
			db.interviews.orderBy("lastUpdated").reverse().toArray(),
			db.protocols.toArray(),
		]);
		const protoMap = new Map<string, ProtocolRecord>(protocols.map((p) => [p.id, p]));
		setRows(
			interviews.map((i) => ({
				...i,
				protocolName: protoMap.get(i.protocolId)?.name ?? "Unknown protocol",
			})),
		);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const onDelete = useCallback(
		async (id: string) => {
			const sure = window.confirm("Delete this interview? This cannot be undone.");
			if (!sure) return;
			await db.interviews.delete(id);
			await refresh();
		},
		[refresh],
	);

	const visible = rows.filter((r) => {
		if (filter === "in-progress") return !r.finishTime;
		if (filter === "completed") return Boolean(r.finishTime);
		return true;
	});

	return (
		<>
			<PageHeader
				title="Interviews"
				subtitle="Every interview ever started on this device. Filter to find what you need."
				actions={
					<div className="flex gap-1 rounded-md border border-border bg-surface-1 p-1">
						{(["all", "in-progress", "completed"] as const).map((key) => (
							<button
								type="button"
								key={key}
								onClick={() => setFilter(key)}
								className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
									filter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
								}`}
							>
								{key === "in-progress" ? "In progress" : key}
							</button>
						))}
					</div>
				}
			/>

			{visible.length === 0 ? (
				<EmptyState
					title="No interviews"
					description={
						filter === "all"
							? "Pick a protocol and start an interview to see it here."
							: "Nothing matches the current filter."
					}
					icon={<ClipboardList size={36} />}
					action={
						<Link href="/protocols">
							<Button variant="outline">Go to protocols</Button>
						</Link>
					}
				/>
			) : (
				<div className="overflow-hidden rounded-md border border-border bg-surface-1">
					<table className="w-full text-sm">
						<thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
							<tr>
								<th className="px-4 py-3">Participant</th>
								<th className="px-4 py-3">Protocol</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Last updated</th>
								<th className="px-4 py-3">Exported</th>
								<th className="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{visible.map((row) => (
								<tr key={row.id} className="hover:bg-platinum/40">
									<td className="px-4 py-3 font-medium">{row.participantIdentifier}</td>
									<td className="px-4 py-3 text-muted-foreground">{row.protocolName}</td>
									<td className="px-4 py-3">
										{row.finishTime ? (
											<span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
												Completed
											</span>
										) : (
											<span className="rounded-full bg-info/15 px-2 py-0.5 text-xs font-semibold text-info">
												In progress
											</span>
										)}
									</td>
									<td className="px-4 py-3 text-muted-foreground">{formatDate(row.lastUpdated)}</td>
									<td className="px-4 py-3 text-muted-foreground">{formatDate(row.exportTime)}</td>
									<td className="px-4 py-3 text-right">
										<div className="flex justify-end gap-2">
											<Link href={`/interview/${row.id}`}>
												<Button size="sm" variant="outline">
													{row.finishTime ? "Review" : "Resume"}
												</Button>
											</Link>
											<Button
												size="sm"
												variant="outline"
												color="destructive"
												icon={<Trash2 size={14} />}
												onClick={() => onDelete(row.id)}
												aria-label="Delete interview"
											>
												Delete
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
