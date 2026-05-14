import Button from "@codaco/fresco-ui/Button";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { APP_NAME, APP_VERSION, PLATFORM } from "../env";
import { db } from "../lib/db";
import { getInstallationId } from "../lib/installation-id";

export default function SettingsPage() {
	const [installationId, setInstallationId] = useState("");
	const [counts, setCounts] = useState<{ protocols: number; interviews: number; assets: number }>({
		protocols: 0,
		interviews: 0,
		assets: 0,
	});

	useEffect(() => {
		setInstallationId(getInstallationId());
		(async () => {
			const [protocols, interviews, assets] = await Promise.all([
				db.protocols.count(),
				db.interviews.count(),
				db.assets.count(),
			]);
			setCounts({ protocols, interviews, assets });
		})();
	}, []);

	const onWipe = async () => {
		const sure = window.confirm(
			"This will delete every protocol, asset, and interview on this device. There is no undo. Continue?",
		);
		if (!sure) return;
		await db.transaction("rw", db.protocols, db.assets, db.interviews, async () => {
			await db.protocols.clear();
			await db.assets.clear();
			await db.interviews.clear();
		});
		setCounts({ protocols: 0, interviews: 0, assets: 0 });
	};

	return (
		<>
			<PageHeader title="Settings" subtitle="About this installation." />

			<section className="mb-6 rounded-md border border-border bg-surface-1 p-5">
				<h2 className="mb-3 font-heading text-lg font-semibold">About</h2>
				<dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<Row label="Application" value={APP_NAME} />
					<Row label="Version" value={APP_VERSION} />
					<Row label="Runtime" value={PLATFORM} />
					<Row label="Installation ID" value={installationId} />
				</dl>
			</section>

			<section className="mb-6 rounded-md border border-border bg-surface-1 p-5">
				<h2 className="mb-3 font-heading text-lg font-semibold">Local storage</h2>
				<dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
					<Row label="Protocols" value={counts.protocols} />
					<Row label="Interviews" value={counts.interviews} />
					<Row label="Asset files" value={counts.assets} />
				</dl>
			</section>

			<section className="rounded-md border border-error/40 bg-error/5 p-5">
				<h2 className="mb-1 font-heading text-lg font-semibold text-error">Danger zone</h2>
				<p className="mb-3 text-sm text-muted-foreground">
					Erase every protocol, asset, and interview stored on this device. This cannot be undone.
				</p>
				<Button color="destructive" onClick={onWipe}>
					Erase all local data
				</Button>
			</section>
		</>
	);
}

function Row({ label, value }: { label: string; value: string | number }) {
	return (
		<div>
			<dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
			<dd className="font-mono text-sm">{value}</dd>
		</div>
	);
}
