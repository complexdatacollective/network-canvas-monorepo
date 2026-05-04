"use client";

import { Toast } from "@base-ui/react/toast";
import { DndStoreProvider } from "@codaco/fresco-ui/dnd/dnd";
import { MotionConfig } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import SuperJSON from "superjson";
import {
	type AssetRequestHandler,
	type InterviewPayload,
	InterviewToastViewport,
	interviewToastManager,
	Shell,
	type StepChangeHandler,
} from "../src";

// Shape of the object SyntheticInterview.getInterviewPayload() returns —
// flat session fields plus a separate `protocol` and `assetUrls`. We split
// it into the package's `InterviewPayload` here so the Shell receives the
// shape it expects.
type RawSyntheticPayload = {
	id: string;
	startTime: Date;
	finishTime: Date | null;
	exportTime: Date | null;
	lastUpdated: Date;
	currentStep: number;
	stageMetadata: unknown;
	network: InterviewPayload["session"]["network"];
	protocol: InterviewPayload["protocol"];
};

function buildPayload(raw: RawSyntheticPayload): {
	payload: InterviewPayload;
	initialStep: number;
} {
	const { protocol, ...sessionFields } = raw;
	return {
		payload: {
			session: sessionFields as unknown as InterviewPayload["session"],
			protocol,
		},
		initialStep: raw.currentStep,
	};
}

const StoryInterviewShell = (props: { rawPayload: string }) => {
	const { payload, initialStep } = useMemo(() => {
		const raw = SuperJSON.parse<RawSyntheticPayload>(props.rawPayload);
		return buildPayload(raw);
	}, [props.rawPayload]);

	const [currentStep, setCurrentStep] = useState<number>(initialStep);

	const onStepChange = useCallback<StepChangeHandler>((step) => {
		setCurrentStep(step);
	}, []);

	const onRequestAsset: AssetRequestHandler = useCallback(
		(assetId) =>
			Promise.resolve(`data:text/plain;base64,${btoa(`storybook-asset:${assetId}`)}`),
		[],
	);

	const onSync = useCallback(() => Promise.resolve(), []);
	const onFinish = useCallback(() => Promise.resolve(), []);

	return (
		<MotionConfig reducedMotion="user">
			<Toast.Provider toastManager={interviewToastManager}>
				<DndStoreProvider>
					<Shell
						payload={payload}
						currentStep={currentStep}
						onStepChange={onStepChange}
						onSync={onSync}
						onFinish={onFinish}
						onRequestAsset={onRequestAsset}
						flags={{ isDevelopment: true }}
					/>
					<InterviewToastViewport />
				</DndStoreProvider>
			</Toast.Provider>
		</MotionConfig>
	);
};

export default StoryInterviewShell;
