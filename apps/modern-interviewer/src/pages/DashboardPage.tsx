import Button from "@codaco/fresco-ui/Button";
import { ClipboardList, Download, FileBox, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import PageHeader from "../components/PageHeader";
import { db, type InterviewRecord, type ProtocolRecord } from "../lib/db";
import { formatDate } from "../lib/format";

type Stats = {
	protocolCount: number;
	interviewCount: number;
	completedCount: number;
	pendingExports: number;
};

export default function DashboardPage() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [recentInterviews, setRecentInterviews] = useState<InterviewRecord[]>([]);
	const [recentProtocols, setRecentProtocols] = useState<ProtocolRecord[]>([]);

	useEffect(() => {
		(async () => {
			const [protocolCount, interviewCount, completedCount, pendingExports, recents, protocols] = await Promise.all([
				db.protocols.count(),
				db.interviews.count(),
				db.interviews.where("finishTime").notEqual("").count(),
				db.interviews.filter((i) => Boolean(i.finishTime) && !i.exportTime).count(),
				db.interviews.orderBy("lastUpdated").reverse().limit(5).toArray(),
				db.protocols.orderBy("lastUsedAt").reverse().limit(5).toArray(),
			]);
			setStats({ protocolCount, interviewCount, completedCount, pendingExports });
			setRecentInterviews(recents);
			setRecentProtocols(protocols);
		})();
	}, []);

	return (
		<>
			<PageHeader
				title="Dashboard"
				subtitle="Manage protocols, run interviews, and export collected data."
				actions={
					<>
						<Link href="/protocols">
							<Button variant="outline" icon={<FileBox size={16} />}>
								Manage protocols
							</Button>
						</Link>
						<Link href="/interviews">
							<Button icon={<ClipboardList size={16} />}>Start interview</Button>
						</Link>
					</>
				}
			/>

			<section className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<StatCard label="Protocols" value={stats?.protocolCount ?? 0} icon={<FileBox size={20} />} />
				<StatCard label="Interviews" value={stats?.interviewCount ?? 0} icon={<ClipboardList size={20} />} />
				<StatCard label="Completed" value={stats?.completedCount ?? 0} icon={<Sparkles size={20} />} />
				<StatCard label="Pending export" value={stats?.pendingExports ?? 0} icon={<Download size={20} />} />
			</section>

			<section className="mt-8 grid gap-6 lg:grid-cols-2">
				<div className="rounded-md border border-border bg-surface-1 p-5">
					<header className="mb-3 flex items-center justify-between">
						<h2 className="font-heading text-lg font-semibold">Recent protocols</h2>
						<Link
							href="/protocols"
							className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
						>
							View all
						</Link>
					</header>
					{recentProtocols.length === 0 ? (
						<p className="text-sm text-muted-foreground">No protocols imported yet.</p>
					) : (
						<ul className="divide-y divide-border">
							{recentProtocols.map((p) => (
								<li key={p.id} className="py-2">
									<Link href={`/protocols/${p.id}`} className="block hover:bg-platinum/50">
										<div className="font-medium">{p.name}</div>
										<div className="text-xs text-muted-foreground">Imported {formatDate(p.importedAt)}</div>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="rounded-md border border-border bg-surface-1 p-5">
					<header className="mb-3 flex items-center justify-between">
						<h2 className="font-heading text-lg font-semibold">Recent interviews</h2>
						<Link
							href="/interviews"
							className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
						>
							View all
						</Link>
					</header>
					{recentInterviews.length === 0 ? (
						<p className="text-sm text-muted-foreground">No interviews yet. Start one from the Interviews tab.</p>
					) : (
						<ul className="divide-y divide-border">
							{recentInterviews.map((i) => (
								<li key={i.id} className="flex items-center justify-between py-2">
									<div>
										<div className="font-medium">{i.participantIdentifier}</div>
										<div className="text-xs text-muted-foreground">Updated {formatDate(i.lastUpdated)}</div>
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
				</div>
			</section>
		</>
	);
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-4">
			<div className="flex items-center justify-between text-muted-foreground">
				<span className="text-xs uppercase tracking-wider">{label}</span>
				{icon}
			</div>
			<div className="font-heading text-3xl font-bold">{value}</div>
		</div>
	);
}
