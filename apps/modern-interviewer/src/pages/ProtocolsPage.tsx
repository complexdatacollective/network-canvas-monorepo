import Button from "@codaco/fresco-ui/Button";
import { FileBox, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import EmptyState from "../components/EmptyState";
import FileDropTarget from "../components/FileDropTarget";
import PageHeader from "../components/PageHeader";
import ProgressDialog from "../components/ProgressDialog";
import { db, type ProtocolRecord } from "../lib/db";
import { formatDate, truncate } from "../lib/format";
import { platform } from "../platform";
import { importProtocolFromBytes } from "../protocols/import-protocol";

type ImportState = { kind: "idle" } | { kind: "importing"; fileName: string } | { kind: "error"; message: string };

export default function ProtocolsPage() {
	const [protocols, setProtocols] = useState<ProtocolRecord[]>([]);
	const [importState, setImportState] = useState<ImportState>({ kind: "idle" });

	const refresh = useCallback(async () => {
		const list = await db.protocols.orderBy("importedAt").reverse().toArray();
		setProtocols(list);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const handleFiles = useCallback(
		async (files: File[]) => {
			const file = files[0];
			if (!file) return;
			setImportState({ kind: "importing", fileName: file.name });
			try {
				const buffer = await file.arrayBuffer();
				const result = await importProtocolFromBytes(new Uint8Array(buffer), file.name);
				if (!result.ok) {
					setImportState({ kind: "error", message: result.reason });
					return;
				}
				await refresh();
				setImportState({ kind: "idle" });
			} catch (err) {
				setImportState({
					kind: "error",
					message: err instanceof Error ? err.message : String(err),
				});
			}
		},
		[refresh],
	);

	const onPickFile = useCallback(async () => {
		const picked = await platform.pickProtocolFile();
		if (!picked) return;
		setImportState({ kind: "importing", fileName: picked.name });
		const result = await importProtocolFromBytes(picked.data, picked.name);
		if (!result.ok) {
			setImportState({ kind: "error", message: result.reason });
			return;
		}
		await refresh();
		setImportState({ kind: "idle" });
	}, [refresh]);

	const onDelete = useCallback(
		async (id: string) => {
			const sure = window.confirm("Delete this protocol? Existing interviews referencing it will remain.");
			if (!sure) return;
			await db.transaction("rw", db.protocols, db.assets, async () => {
				await db.assets.where("protocolId").equals(id).delete();
				await db.protocols.delete(id);
			});
			await refresh();
		},
		[refresh],
	);

	return (
		<>
			<PageHeader
				title="Protocols"
				subtitle="Import .netcanvas files and manage the interview templates available on this device."
				actions={
					<Button icon={<Upload size={16} />} onClick={onPickFile}>
						Import protocol
					</Button>
				}
			/>

			<div className="mb-6">
				<FileDropTarget
					onFiles={handleFiles}
					accept=".netcanvas,application/zip"
					label="Drop a .netcanvas file to import"
					hint="The file will be validated and migrated to the current schema automatically."
				/>
			</div>

			{protocols.length === 0 ? (
				<EmptyState
					title="No protocols yet"
					description="Import a .netcanvas file to start running interviews."
					icon={<FileBox size={36} />}
				/>
			) : (
				<div className="overflow-hidden rounded-md border border-border bg-surface-1">
					<table className="w-full text-sm">
						<thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
							<tr>
								<th className="px-4 py-3">Name</th>
								<th className="px-4 py-3">Description</th>
								<th className="px-4 py-3">Imported</th>
								<th className="px-4 py-3">Schema</th>
								<th className="px-4 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{protocols.map((p) => (
								<tr key={p.id} className="hover:bg-platinum/40">
									<td className="px-4 py-3 font-medium">
										<Link href={`/protocols/${p.id}`} className="hover:underline">
											{p.name}
										</Link>
									</td>
									<td className="px-4 py-3 text-muted-foreground">
										{p.description ? truncate(p.description, 80) : "—"}
									</td>
									<td className="px-4 py-3 text-muted-foreground">{formatDate(p.importedAt)}</td>
									<td className="px-4 py-3 text-muted-foreground">v{p.schemaVersion}</td>
									<td className="px-4 py-3 text-right">
										<Button
											size="sm"
											variant="outline"
											color="destructive"
											icon={<Trash2 size={14} />}
											onClick={() => onDelete(p.id)}
										>
											Delete
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<ProgressDialog
				open={importState.kind === "importing"}
				title="Importing protocol"
				message={importState.kind === "importing" ? `Reading ${importState.fileName}…` : undefined}
			/>

			{importState.kind === "error" ? (
				<div className="mt-4 rounded-md border border-error bg-error/10 p-4 text-sm text-error">
					<strong className="block font-semibold">Import failed</strong>
					<span>{importState.message}</span>
					<button
						type="button"
						className="ml-3 text-xs font-semibold underline"
						onClick={() => setImportState({ kind: "idle" })}
					>
						Dismiss
					</button>
				</div>
			) : null}
		</>
	);
}
