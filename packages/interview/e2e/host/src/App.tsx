import type { AssetRequestHandler, InterviewPayload, StepChangeHandler } from "@codaco/interview";
import { Shell } from "@codaco/interview";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createInterviewStateStore, makeMockSync, mockFinish } from "./mockCallbacks";
import { getTestState, installTestHooks, subscribe } from "./testHooks";

const sessionStore = createInterviewStateStore();
const mockSync = makeMockSync(sessionStore);

const mockAssetReq: AssetRequestHandler = async (assetId: string) => {
	const url = getTestState().assetUrls.get(assetId);
	if (!url) throw new Error(`No URL registered for asset ${assetId}`);
	return url;
};

installTestHooks();

function useTestState() {
	return useSyncExternalStore(
		subscribe,
		() =>
			Array.from(getTestState().interviews.entries())
				.map(([id]) => id)
				.join(","),
		() => "",
	);
}

function getStepFromUrl(): number | undefined {
	const params = new URLSearchParams(window.location.search);
	const step = params.get("step");
	return step !== null ? Number(step) : undefined;
}

export default function App() {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [currentStep, setCurrentStep] = useState<number | undefined>(undefined);
	useTestState();

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setActiveId(params.get("interviewId"));
		setCurrentStep(getStepFromUrl());
	}, []);

	const onStepChange = useCallback<StepChangeHandler>((step) => {
		setCurrentStep(step);
		const params = new URLSearchParams(window.location.search);
		params.set("step", String(step));
		window.history.replaceState(null, "", `?${params.toString()}`);
	}, []);

	if (!activeId) {
		return <div>No interview selected. Use ?interviewId=... in the URL.</div>;
	}

	const entry = getTestState().interviews.get(activeId);
	if (!entry) {
		return <div>Unknown interview ID: {activeId}</div>;
	}

	const protocol = getTestState().protocols.get(entry.protocolId);
	if (!protocol) {
		return <div>Unknown protocol for interview: {entry.protocolId}</div>;
	}

	const payload: InterviewPayload = {
		session: entry.session,
		protocol,
	};

	return (
		<Shell
			payload={payload}
			onSync={mockSync}
			onFinish={mockFinish}
			onRequestAsset={mockAssetReq}
			currentStep={currentStep}
			onStepChange={onStepChange}
			flags={{ isE2E: true }}
		/>
	);
}
