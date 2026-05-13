import {
	createInitialNetwork,
	generateNetwork,
	type InterviewPayload,
	type SessionPayload,
	Shell,
} from "@codaco/interview";
import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { currentProtocolToPayload } from "./currentProtocolToPayload";
import { isPreviewMessage, type PreviewPayload } from "./messages";
import { useAssetResolver } from "./useAssetResolver";

const noopSync = async () => {};
const noopFinish = async () => {};

function buildSession(payload: PreviewPayload): SessionPayload {
	const now = new Date().toISOString();
	const network = payload.useSyntheticData
		? generateNetwork(payload.protocol.codebook, payload.protocol.stages).network
		: createInitialNetwork();
	return {
		id: uuid(),
		startTime: now,
		finishTime: null,
		exportTime: null,
		lastUpdated: now,
		network,
	};
}

export function PreviewHost() {
	const [interviewPayload, setInterviewPayload] = useState<InterviewPayload | null>(null);
	const [currentStep, setCurrentStep] = useState(0);
	const opener = window.opener as Window | null;
	const onRequestAsset = useAssetResolver();

	useEffect(() => {
		if (!opener) return;

		const expectedOrigin = window.location.origin;

		const onMessage = (event: MessageEvent) => {
			if (event.source !== opener) return;
			if (event.origin !== expectedOrigin) return;
			if (!isPreviewMessage(event.data)) return;
			if (event.data.type !== "preview:payload") return;
			const previewPayload: PreviewPayload = event.data;
			setInterviewPayload({
				protocol: currentProtocolToPayload(previewPayload.protocol),
				session: buildSession(previewPayload),
			});
			setCurrentStep(previewPayload.startStage);
		};

		window.addEventListener("message", onMessage);
		opener.postMessage({ type: "preview:ready" }, expectedOrigin);
		return () => window.removeEventListener("message", onMessage);
	}, [opener]);

	if (!opener) {
		return (
			<div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
				<h1 className="text-2xl font-semibold">This preview has ended</h1>
				<p>Return to Architect and click Preview again to start a new one.</p>
				<button type="button" onClick={() => window.close()} className="rounded-md bg-accent px-4 py-2 text-white">
					Close tab
				</button>
			</div>
		);
	}

	if (!interviewPayload) {
		return (
			<div className="flex h-dvh w-full items-center justify-center">
				<p>Loading preview…</p>
			</div>
		);
	}

	return (
		<Shell
			payload={interviewPayload}
			onSync={noopSync}
			onFinish={noopFinish}
			onRequestAsset={onRequestAsset}
			currentStep={currentStep}
			onStepChange={setCurrentStep}
			disableAnalytics
			analytics={{ installationId: "architect-preview", hostApp: "architect-preview" }}
		/>
	);
}
