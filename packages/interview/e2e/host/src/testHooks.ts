import { v4 as uuid } from "uuid";
import type { ProtocolPayload, SessionPayload, SyncHandler } from "../../../src/contract/types";
import { createInitialNetwork } from "../../../src/store/modules/session";

type InterviewEntry = {
	protocolId: string;
	participantId: string;
	session: SessionPayload;
};

type TestState = {
	protocols: Map<string, ProtocolPayload>;
	interviews: Map<string, InterviewEntry>;
	assetUrls: Map<string, string>;
	sync: SyncHandler;
};

type StateSubscriber = () => void;

let state: TestState = createEmptyState();
const subscribers = new Set<StateSubscriber>();

function createEmptyState(): TestState {
	return {
		protocols: new Map<string, ProtocolPayload>(),
		interviews: new Map<string, InterviewEntry>(),
		assetUrls: new Map<string, string>(),
		sync: makeSyncHandler(),
	};
}

function makeSyncHandler(): SyncHandler {
	return async (interviewId: string, session: SessionPayload): Promise<void> => {
		const entry = state.interviews.get(interviewId);
		if (entry) {
			state.interviews.set(interviewId, { ...entry, session });
			notifySubscribers();
		}
	};
}

function notifySubscribers(): void {
	for (const subscriber of subscribers) {
		subscriber();
	}
}

export function getTestState(): TestState {
	return state;
}

export function subscribe(fn: StateSubscriber): () => void {
	subscribers.add(fn);
	return () => {
		subscribers.delete(fn);
	};
}

export function installTestHooks(): void {
	// Reset state on each install so tests are isolated.
	state = createEmptyState();
	subscribers.clear();

	const testHooks = {
		installProtocol(protocol: ProtocolPayload): void {
			state.protocols.set(protocol.id, protocol);
			for (const asset of protocol.assets) {
				state.assetUrls.set(asset.assetId, "");
			}
			notifySubscribers();
		},

		setAssetUrl(assetId: string, url: string): void {
			state.assetUrls.set(assetId, url);
			notifySubscribers();
		},

		createInterview(protocolId: string, participantId: string): string {
			const id = uuid();
			const session: SessionPayload = {
				id,
				startTime: new Date().toISOString(),
				finishTime: null,
				exportTime: null,
				lastUpdated: new Date().toISOString(),
				network: createInitialNetwork(),
				currentStep: 0,
			};
			state.interviews.set(id, { protocolId, participantId, session });
			notifySubscribers();
			return id;
		},

		getNetworkState(interviewId: string): SessionPayload["network"] | undefined {
			return state.interviews.get(interviewId)?.session.network;
		},
	};

	(globalThis as Record<string, unknown>).__test = testHooks;
}
