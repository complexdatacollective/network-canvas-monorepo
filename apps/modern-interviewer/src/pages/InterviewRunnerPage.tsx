import Button from "@codaco/fresco-ui/Button";
import { type InterviewPayload, Shell } from "@codaco/interview";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { APP_NAME, APP_VERSION } from "../env";
import { finishInterviewInDb } from "../interviews/finish-interview";
import { loadInterview } from "../interviews/load-interview";
import { syncInterviewToDb, updateInterviewStep } from "../interviews/sync-interview";
import { getInstallationId } from "../lib/installation-id";
import { AssetUrlCache } from "../protocols/asset-resolution";

type RunnerPageProps = {
	interviewId: string;
};

type State =
	| { kind: "loading" }
	| { kind: "missing" }
	| { kind: "ready"; payload: InterviewPayload; initialStep: number };

export default function InterviewRunnerPage({ interviewId }: RunnerPageProps) {
	const [, setLocation] = useLocation();
	const [state, setState] = useState<State>({ kind: "loading" });
	const [currentStep, setCurrentStep] = useState(0);
	const assetCacheRef = useRef<AssetUrlCache | null>(null);

	useEffect(() => {
		let active = true;
		(async () => {
			const loaded = await loadInterview(interviewId);
			if (!active) return;
			if (!loaded) {
				setState({ kind: "missing" });
				return;
			}
			setCurrentStep(loaded.record.currentStep ?? 0);
			setState({ kind: "ready", payload: loaded.payload, initialStep: loaded.record.currentStep ?? 0 });
		})();
		return () => {
			active = false;
			assetCacheRef.current?.dispose();
			assetCacheRef.current = null;
		};
	}, [interviewId]);

	const onStepChange = useCallback(
		(next: number) => {
			setCurrentStep(next);
			void updateInterviewStep(interviewId, next);
		},
		[interviewId],
	);

	const onFinish = useCallback(
		async (id: string, signal: AbortSignal) => {
			await finishInterviewInDb(id, signal);
			// Navigate back to the dashboard after the engine's exit animation.
			setTimeout(() => setLocation("/interviews"), 300);
		},
		[setLocation],
	);

	const onRequestAsset = useCallback(async (assetId: string) => {
		if (!assetCacheRef.current) assetCacheRef.current = new AssetUrlCache();
		return assetCacheRef.current.resolve(assetId);
	}, []);

	const analytics = useMemo(
		() => ({
			installationId: getInstallationId(),
			hostApp: APP_NAME,
			hostVersion: APP_VERSION,
		}),
		[],
	);

	if (state.kind === "loading") {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground">
				Loading interview…
			</div>
		);
	}
	if (state.kind === "missing") {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-8">
				<h1 className="font-heading text-2xl font-bold">Interview not found</h1>
				<p className="text-sm text-muted-foreground">
					This interview no longer exists. It may have been deleted from another device.
				</p>
				<Link href="/interviews">
					<Button icon={<ArrowLeft size={14} />}>Back to interviews</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="relative flex h-full w-full flex-col bg-background">
			<div className="absolute left-4 top-4 z-10">
				<Link href="/interviews">
					<Button size="sm" variant="outline" icon={<ArrowLeft size={14} />}>
						Exit
					</Button>
				</Link>
			</div>
			<div className="flex h-full w-full flex-1">
				<Shell
					payload={state.payload}
					currentStep={currentStep}
					onStepChange={onStepChange}
					onSync={syncInterviewToDb}
					onFinish={onFinish}
					onRequestAsset={onRequestAsset}
					analytics={analytics}
					disableAnalytics
				/>
			</div>
		</div>
	);
}
