import Button from "@codaco/fresco-ui/Button";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import PageHeader from "../components/PageHeader";
import { createInterview } from "../interviews/create-interview";
import { type AssetRecord, db, type InterviewRecord, type ProtocolRecord } from "../lib/db";
import { formatDate } from "../lib/format";

type ProtocolDetailPageProps = {
	protocolId: string;
};

export default function ProtocolDetailPage({ protocolId }: ProtocolDetailPageProps) {
	const [, setLocation] = useLocation();
	const [protocol, setProtocol] = useState<ProtocolRecord | null>(null);
	const [assets, setAssets] = useState<AssetRecord[]>([]);
	const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
	const [participantId, setParticipantId] = useState("");

	useEffect(() => {
		(async () => {
			const [proto, assetList, interviewList] = await Promise.all([
				db.protocols.get(protocolId),
				db.assets.where("protocolId").equals(protocolId).toArray(),
				db.interviews.where("protocolId").equals(protocolId).reverse().sortBy("lastUpdated"),
			]);
			setProtocol(proto ?? null);
			setAssets(assetList);
			setInterviews(interviewList);
		})();
	}, [protocolId]);

	if (!protocol) {
		return (
			<>
				<PageHeader title="Protocol not found" subtitle="The requested protocol could not be loaded." />
				<Link href="/protocols">
					<Button variant="outline">Back to protocols</Button>
				</Link>
			</>
		);
	}

	const stageCount = Array.isArray(protocol.stages) ? protocol.stages.length : 0;

	const handleStart = async () => {
		const next = await createInterview(protocol, participantId);
		setLocation(`/interview/${next.id}`);
	};

	return (
		<>
			<PageHeader
				title={protocol.name}
				subtitle={protocol.description ?? "Network Canvas protocol"}
				actions={
					<Link href="/protocols">
						<Button variant="outline">Back to protocols</Button>
					</Link>
				}
			/>

			<section className="mb-6 grid gap-4 md:grid-cols-3">
				<Stat label="Stages" value={stageCount} />
				<Stat label="Assets" value={assets.length} />
				<Stat label="Schema version" value={`v${protocol.schemaVersion}`} />
			</section>

			<section className="mb-8 rounded-md border border-border bg-surface-1 p-5">
				<h2 className="mb-2 font-heading text-lg font-semibold">Start a new interview</h2>
				<p className="mb-3 text-sm text-muted-foreground">
					Enter a participant identifier (a study ID, alias, or pseudonym) and start.
				</p>
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						type="text"
						value={participantId}
						onChange={(e) => setParticipantId(e.target.value)}
						placeholder="Participant identifier"
						className="form-field max-w-md"
					/>
					<Button onClick={handleStart}>Start interview</Button>
				</div>
			</section>

			<section className="rounded-md border border-border bg-surface-1 p-5">
				<h2 className="mb-3 font-heading text-lg font-semibold">Interviews using this protocol</h2>
				{interviews.length === 0 ? (
					<p className="text-sm text-muted-foreground">No interviews yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{interviews.map((i) => (
							<li key={i.id} className="flex items-center justify-between py-2">
								<div>
									<div className="font-medium">{i.participantIdentifier}</div>
									<div className="text-xs text-muted-foreground">
										{i.finishTime ? "Completed" : "In progress"} · Updated {formatDate(i.lastUpdated)}
									</div>
								</div>
								<Link href={`/interview/${i.id}`}>
									<Button size="sm" variant="outline">
										{i.finishTime ? "Review" : "Resume"}
									</Button>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</>
	);
}

function Stat({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-md border border-border bg-surface-1 p-4">
			<div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
			<div className="mt-1 font-heading text-2xl font-bold">{value}</div>
		</div>
	);
}
