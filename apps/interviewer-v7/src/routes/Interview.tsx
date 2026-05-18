import Button from "@codaco/fresco-ui/Button";
import Surface from "@codaco/fresco-ui/layout/Surface";
import Heading from "@codaco/fresco-ui/typography/Heading";
import Paragraph from "@codaco/fresco-ui/typography/Paragraph";
import { type InterviewPayload, type SessionPayload, Shell } from "@codaco/interview";
import { LogOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { buildResolvedAssets, makeAssetResolver } from "~/lib/assets/assetResolver";
import { getProtocolByHash, getSession, markSessionFinished, updateSession, updateSettings } from "~/lib/db/api";
import type { StoredSession } from "~/lib/db/types";
import { getInstallationId } from "~/lib/platform/installationId";
import { hostAppName } from "~/lib/platform/platform";

type LoadState =
	| { kind: "loading" }
	| { kind: "missing" }
	| { kind: "ready"; payload: InterviewPayload; resolver: (id: string) => Promise<string> };

export function InterviewRoute({ sessionId }: { sessionId: string }) {
	const [state, setState] = useState<LoadState>({ kind: "loading" });
	const [, navigate] = useLocation();
	const [currentStep, setCurrentStep] = useState(0);

	useEffect(() => {
		let active = true;
		const load = async () => {
			const session = await getSession(sessionId);
			if (!session) {
				if (active) setState({ kind: "missing" });
				return;
			}
			const protocol = await getProtocolByHash(session.protocolHash);
			if (!protocol) {
				if (active) setState({ kind: "missing" });
				return;
			}
			const assets = await buildResolvedAssets(session.protocolHash);
			const payload: InterviewPayload = {
				session: hydrateSession(session),
				protocol: {
					...protocol.protocol,
					id: protocol.id,
					hash: protocol.hash,
					importedAt: protocol.importedAt,
					assets,
				},
			};
			if (!active) return;
			setCurrentStep(session.currentStep ?? 0);
			setState({ kind: "ready", payload, resolver: makeAssetResolver(session.protocolHash) });
			void updateSettings({ lastActiveSessionId: session.id, lastActiveProtocolHash: session.protocolHash });
		};
		void load();
		return () => {
			active = false;
		};
	}, [sessionId]);

	const analytics = useMemo(() => ({ installationId: getInstallationId(), hostApp: hostAppName }), []);

	const handleSync = useCallback(
		async (id: string, session: SessionPayload) => {
			await updateSession(id, {
				network: session.network,
				currentStep,
				stageMetadata: session.stageMetadata as Record<string, unknown> | undefined,
				finishedAt: session.finishTime,
			});
		},
		[currentStep],
	);

	const handleFinish = useCallback(
		async (id: string) => {
			await markSessionFinished(id);
			navigate("/sessions");
		},
		[navigate],
	);

	const handleStepChange = useCallback(
		(step: number) => {
			setCurrentStep(step);
			void updateSession(sessionId, { currentStep: step });
		},
		[sessionId],
	);

	if (state.kind === "loading") {
		return (
			<div className="flex h-dvh items-center justify-center bg-background">
				<Paragraph emphasis="muted">Loading interview...</Paragraph>
			</div>
		);
	}

	if (state.kind === "missing") {
		return (
			<div className="mx-auto flex h-dvh max-w-lg items-center justify-center p-8">
				<Surface level={1} spacing="lg" className="flex flex-col items-center gap-4 text-center">
					<Heading level="h1">Interview not found</Heading>
					<Paragraph>This interview may have been deleted, or the protocol it used is no longer installed.</Paragraph>
					<Button onClick={() => navigate("/")}>Return home</Button>
				</Surface>
			</div>
		);
	}

	return (
		<div className="relative flex h-dvh w-dvw">
			<Shell
				payload={state.payload}
				currentStep={currentStep}
				onStepChange={handleStepChange}
				onSync={handleSync}
				onFinish={handleFinish}
				onRequestAsset={state.resolver}
				analytics={analytics}
				disableAnalytics
			/>
			<Button
				variant="outline"
				size="sm"
				icon={<LogOut className="size-4" />}
				className="absolute top-3 left-3 z-50 bg-background/90 backdrop-blur"
				onClick={() => navigate("/")}
				aria-label="Exit interview and return to dashboard"
			>
				Exit
			</Button>
		</div>
	);
}

function hydrateSession(stored: StoredSession): SessionPayload {
	return {
		id: stored.id,
		startTime: stored.startedAt,
		finishTime: stored.finishedAt,
		exportTime: stored.exportedAt,
		lastUpdated: stored.lastUpdatedAt,
		network: stored.network,
		promptIndex: 0,
		stageMetadata: stored.stageMetadata as SessionPayload["stageMetadata"],
	};
}
