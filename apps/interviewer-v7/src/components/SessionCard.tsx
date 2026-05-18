import Surface from "@codaco/fresco-ui/layout/Surface";
import Heading from "@codaco/fresco-ui/typography/Heading";
import Paragraph from "@codaco/fresco-ui/typography/Paragraph";
import { Calendar, CheckCircle2, Clock, FileText } from "lucide-react";
import type { StoredSession } from "~/lib/db/types";

function relativeTime(date: string): string {
	const diff = Date.now() - new Date(date).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(date).toLocaleDateString();
}

type SessionCardProps = {
	session: StoredSession;
	prominent?: boolean;
};

export function SessionCard({ session, prominent }: SessionCardProps) {
	const nodeCount = session.network.nodes.length;
	const edgeCount = session.network.edges.length;
	return (
		<Surface level={prominent ? 2 : 1} spacing="md" className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<Heading level="h3" margin="none">
					{session.caseId || "Untitled interview"}
				</Heading>
				{session.finishedAt ? (
					<CheckCircle2 className="size-4 text-success" aria-label="Finished" />
				) : (
					<Clock className="size-4 text-muted-foreground" aria-label="In progress" />
				)}
			</div>
			<Paragraph emphasis="muted">{session.protocolName}</Paragraph>
			<dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					<Calendar className="size-3" aria-hidden />
					<dt className="sr-only">Updated</dt>
					<dd>Updated {relativeTime(session.lastUpdatedAt)}</dd>
				</div>
				<div className="flex items-center gap-1">
					<FileText className="size-3" aria-hidden />
					<dt className="sr-only">Network size</dt>
					<dd>
						{nodeCount} node{nodeCount === 1 ? "" : "s"} / {edgeCount} edge{edgeCount === 1 ? "" : "s"}
					</dd>
				</div>
			</dl>
		</Surface>
	);
}
