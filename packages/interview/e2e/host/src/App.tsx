import { Toast } from "@base-ui/react/toast";
import { DndStoreProvider } from "@codaco/fresco-ui/dnd/dnd";
import type { AssetRequestHandler, InterviewPayload, StepChangeHandler } from "@codaco/interview";
import { InterviewToastViewport, interviewToastManager, Shell } from "@codaco/interview";
import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { mockFinish, mockSync } from "./mockCallbacks";
import { getTestState, installTestHooks, subscribe } from "./testHooks";

globalThis.BASE_UI_ANIMATIONS_DISABLED = true;

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

	const entry = activeId ? getTestState().interviews.get(activeId) : undefined;
	const protocol = entry ? getTestState().protocols.get(entry.protocolId) : undefined;

	// Stable ref to the current entry/protocol so useMemo only recreates the
	// payload (and thus the Redux store inside Shell) when the interview ID
	// changes, not on every step change or App re-render.
	const entryRef = useRef(entry);
	entryRef.current = entry;
	const protocolRef = useRef(protocol);
	protocolRef.current = protocol;

	const payload: InterviewPayload | null = useMemo(() => {
		const e = entryRef.current;
		const p = protocolRef.current;
		if (!e || !p) return null;
		return { session: e.session, protocol: p };
	}, [activeId]);

	if (!activeId) {
		return <div>No interview selected. Use ?interviewId=... in the URL.</div>;
	}

	if (!entry) {
		return <div>Unknown interview ID: {activeId}</div>;
	}

	if (!protocol) {
		return <div>Unknown protocol for interview: {entry.protocolId}</div>;
	}

	if (!payload) {
		return <div>Loading...</div>;
	}

	return (
		<MotionConfig reducedMotion="always" skipAnimations>
			<Toast.Provider toastManager={interviewToastManager}>
				<DndStoreProvider>
					<Shell
						payload={payload}
						onSync={mockSync}
						onFinish={mockFinish}
						onRequestAsset={mockAssetReq}
						currentStep={currentStep}
						onStepChange={onStepChange}
						flags={{ isE2E: true }}
						analytics={{ installationId: "e2e", hostApp: "e2e" }}
						disableAnalytics={true}
					/>
				</DndStoreProvider>
				<InterviewToastViewport />
			</Toast.Provider>
		</MotionConfig>
	);
}
