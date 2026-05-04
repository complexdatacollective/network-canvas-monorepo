import { v4 as uuid } from "uuid";
import type { ProtocolPayload, SessionPayload } from "../../../src/contract/types";
import { createInitialNetwork } from "../../../src/store/modules/session";

const STORAGE_KEY = "__e2e_test_state";

type InterviewEntry = {
	protocolId: string;
	participantId: string;
	session: SessionPayload;
};

type SerializableState = {
	protocols: Record<string, ProtocolPayload>;
	interviews: Record<string, InterviewEntry>;
	assetUrls: Record<string, string>;
};

type TestState = {
	protocols: Map<string, ProtocolPayload>;
	interviews: Map<string, InterviewEntry>;
	assetUrls: Map<string, string>;
};

type StateSubscriber = () => void;

let state: TestState = createEmptyState();
const subscribers = new Set<StateSubscriber>();

function createEmptyState(): TestState {
	return {
		protocols: new Map<string, ProtocolPayload>(),
		interviews: new Map<string, InterviewEntry>(),
		assetUrls: new Map<string, string>(),
	};
}

function notifySubscribers(): void {
	for (const subscriber of subscribers) {
		subscriber();
	}
}

function persistState(): void {
	try {
		const serializable: SerializableState = {
			protocols: Object.fromEntries(state.protocols),
			interviews: Object.fromEntries(state.interviews),
			assetUrls: Object.fromEntries(state.assetUrls),
		};
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
	} catch {
		// Ignore storage errors
	}
}

function restoreState(): TestState {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return createEmptyState();
		const parsed = JSON.parse(raw) as SerializableState;
		const restored = createEmptyState();
		for (const [k, v] of Object.entries(parsed.protocols)) {
			restored.protocols.set(k, v);
		}
		for (const [k, v] of Object.entries(parsed.interviews)) {
			restored.interviews.set(k, v);
		}
		for (const [k, v] of Object.entries(parsed.assetUrls)) {
			restored.assetUrls.set(k, v);
		}
		return restored;
	} catch {
		return createEmptyState();
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
	// Restore persisted state so that protocols/interviews installed before
	// a page navigation (page.goto) survive the reload.
	state = restoreState();
	subscribers.clear();

	const testHooks = {
		installProtocol(protocol: ProtocolPayload): void {
			state.protocols.set(protocol.id, protocol);
			for (const asset of protocol.assets) {
				state.assetUrls.set(asset.assetId, "");
			}
			persistState();
			notifySubscribers();
		},

		setAssetUrl(assetId: string, url: string): void {
			state.assetUrls.set(assetId, url);
			persistState();
			notifySubscribers();
		},

		createInterview(protocolId: string, participantId: string): string {
			const id = uuid();
			// This session is the initial payload Shell mounts with. After
			// mount, Shell owns its state in Redux — getNetworkState reads
			// from that live store, not from this snapshot.
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
			persistState();
			notifySubscribers();
			return id;
		},

		// Reads live state from the running Shell's Redux store. Shell exposes
		// it on window.__interviewStore when flags.isE2E is true.
		getNetworkState(): SessionPayload["network"] | undefined {
			return window.__interviewStore?.getState().session.network;
		},

		/** Clear all persisted state. Call this between test suites to reset. */
		reset(): void {
			state = createEmptyState();
			sessionStorage.removeItem(STORAGE_KEY);
			notifySubscribers();
		},
	};

	(globalThis as Record<string, unknown>).__test = testHooks;
}
