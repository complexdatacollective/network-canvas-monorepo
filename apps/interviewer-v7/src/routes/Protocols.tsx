import Button from "@codaco/fresco-ui/Button";
import useDialog from "@codaco/fresco-ui/dialogs/useDialog";
import Surface from "@codaco/fresco-ui/layout/Surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@codaco/fresco-ui/Table";
import { useToast } from "@codaco/fresco-ui/Toast";
import PageHeader from "@codaco/fresco-ui/typography/PageHeader";
import Paragraph from "@codaco/fresco-ui/typography/Paragraph";
import { FilePlus2, Globe, PlayCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ImportFromUrlDialog } from "~/components/ImportFromUrlDialog";
import { NewSessionDialog } from "~/components/NewSessionDialog";
import { deleteProtocol, listProtocols } from "~/lib/db/api";
import type { ProtocolWithCounts } from "~/lib/db/types";
import { pickProtocolFile } from "~/lib/files/pickFile";
import { importProtocolFromFile } from "~/lib/protocol/importProtocol";

export function ProtocolsRoute() {
	const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
	const [importing, setImporting] = useState(false);
	const [urlDialogOpen, setUrlDialogOpen] = useState(false);
	const [newSessionProtocolHash, setNewSessionProtocolHash] = useState<string | null>(null);
	const [, navigate] = useLocation();
	const toast = useToast();
	const { confirm } = useDialog();

	const reload = useCallback(async () => {
		setProtocols(await listProtocols());
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleImport = useCallback(async () => {
		const picked = await pickProtocolFile();
		if (!picked) return;
		setImporting(true);
		try {
			const result = await importProtocolFromFile(picked.file);
			if (result.success) {
				toast.add({
					title: "Protocol imported",
					description: result.protocol.name,
					variant: "success",
				});
				await reload();
			} else {
				toast.add({
					title: "Import failed",
					description: result.message,
					variant: "destructive",
				});
			}
		} finally {
			setImporting(false);
		}
	}, [reload, toast]);

	const handleDelete = useCallback(
		async (protocol: ProtocolWithCounts) => {
			const result = await confirm({
				title: `Delete "${protocol.name}"?`,
				description:
					protocol.sessionCount > 0
						? `This will also delete ${protocol.sessionCount} interview(s) collected with this protocol. This cannot be undone.`
						: "This cannot be undone.",
				confirmLabel: "Delete protocol",
				intent: "destructive",
				onConfirm: async () => {
					await deleteProtocol(protocol.hash);
				},
			});
			if (result === true) {
				toast.add({
					title: "Protocol deleted",
					description: protocol.name,
				});
				await reload();
			}
		},
		[confirm, reload, toast],
	);

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<PageHeader headerText="Protocols" subHeaderText="Import, manage, and remove installed protocols." />
				<div className="flex gap-2">
					<Button onClick={handleImport} disabled={importing} icon={<FilePlus2 className="size-4" />}>
						{importing ? "Importing..." : "Import from file"}
					</Button>
					<Button onClick={() => setUrlDialogOpen(true)} variant="outline" icon={<Globe className="size-4" />}>
						Import from URL
					</Button>
				</div>
			</div>

			{protocols.length === 0 ? (
				<Surface level={1} spacing="xl" className="text-center">
					<Paragraph emphasis="muted">No protocols installed yet. Import a `.netcanvas` file to begin.</Paragraph>
				</Surface>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Schema</TableHead>
							<TableHead>Imported</TableHead>
							<TableHead>Interviews</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{protocols.map((protocol) => (
							<TableRow key={protocol.hash}>
								<TableCell>
									<div className="font-medium">{protocol.name}</div>
									{protocol.description ? (
										<div className="text-xs text-muted-foreground">{protocol.description}</div>
									) : null}
								</TableCell>
								<TableCell>v{protocol.schemaVersion}</TableCell>
								<TableCell>{new Date(protocol.importedAt).toLocaleDateString()}</TableCell>
								<TableCell>{protocol.sessionCount}</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<Button
											size="sm"
											variant="outline"
											icon={<PlayCircle className="size-4" />}
											onClick={() => setNewSessionProtocolHash(protocol.hash)}
										>
											Start interview
										</Button>
										<Button
											size="sm"
											variant="outline"
											icon={<Trash2 className="size-4" />}
											onClick={() => void handleDelete(protocol)}
										>
											Delete
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			{newSessionProtocolHash ? (
				<NewSessionDialog
					open
					protocolHash={newSessionProtocolHash}
					onClose={() => setNewSessionProtocolHash(null)}
					onCreated={(session) => {
						setNewSessionProtocolHash(null);
						navigate(`/interview/${session.id}`);
					}}
				/>
			) : null}

			<ImportFromUrlDialog
				open={urlDialogOpen}
				onClose={() => setUrlDialogOpen(false)}
				onImported={() => void reload()}
			/>
		</div>
	);
}
