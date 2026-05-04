import { useEffect, useState, useSyncExternalStore } from "react";
import { Shell } from "@codaco/interview";
import type { AssetRequestHandler, InterviewPayload } from "@codaco/interview";
import {
	createInterviewStateStore,
	makeMockSync,
	mockFinish,
} from "./mockCallbacks";
import { installTestHooks, subscribe, getTestState } from "./testHooks";

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

export default function App() {
	const [activeId, setActiveId] = useState<string | null>(null);
	useTestState();

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setActiveId(params.get("interviewId"));
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
			flags={{ isE2E: true }}
		/>
	);
}
