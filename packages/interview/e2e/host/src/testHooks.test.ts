import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtocolPayload, SessionPayload } from "../../../src/contract/types";
import { createInitialNetwork } from "../../../src/store/modules/session";
import { getTestState, installTestHooks, subscribe } from "./testHooks";

function makeSession(overrides?: Partial<SessionPayload>): SessionPayload {
	return {
		id: "session-1",
		startTime: new Date().toISOString(),
		finishTime: null,
		exportTime: null,
		lastUpdated: new Date().toISOString(),
		network: createInitialNetwork(),
		currentStep: 0,
		...overrides,
	};
}

function makeProtocol(overrides?: Partial<ProtocolPayload>): ProtocolPayload {
	return {
		id: "protocol-1",
		importedAt: new Date().toISOString(),
		name: "Test Protocol",
		description: "",
		lastModified: "2026-01-01T00:00:00.000Z",
		schemaVersion: 8,
		codebook: { node: {}, edge: {}, ego: {} },
		stages: [],
		assets: [],
		...overrides,
	};
}

describe("installTestHooks", () => {
	beforeEach(() => {
		installTestHooks();
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).__test;
	});

	it("installs __test on globalThis", () => {
		expect(typeof (globalThis as Record<string, unknown>).__test).toBe("object");
	});

	it("exposes installProtocol, createInterview, getNetworkState", () => {
		const testGlobal = (globalThis as Record<string, unknown>).__test as Record<string, unknown>;
		expect(typeof testGlobal.installProtocol).toBe("function");
		expect(typeof testGlobal.createInterview).toBe("function");
		expect(typeof testGlobal.getNetworkState).toBe("function");
	});
});

describe("getTestState", () => {
	beforeEach(() => {
		installTestHooks();
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).__test;
	});

	it("returns an empty protocols and interviews map initially", () => {
		const state = getTestState();
		expect(state.protocols.size).toBe(0);
		expect(state.interviews.size).toBe(0);
	});

	it("reflects protocol after installProtocol is called", () => {
		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
		};
		const protocol = makeProtocol({ id: "p-1" });
		testGlobal.installProtocol(protocol);

		const state = getTestState();
		expect(state.protocols.get("p-1")).toEqual(protocol);
	});

	it("reflects interview + session after createInterview is called", () => {
		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
			createInterview: (protocolId: string, participantId: string) => string;
		};
		const protocol = makeProtocol({ id: "p-2" });
		testGlobal.installProtocol(protocol);

		const interviewId = testGlobal.createInterview("p-2", "participant-1");

		const state = getTestState();
		expect(state.interviews.has(interviewId)).toBe(true);
		expect(state.interviews.get(interviewId)?.protocolId).toBe("p-2");
		expect(state.interviews.get(interviewId)?.session.currentStep).toBe(0);
	});

	it("getNetworkState returns the current network for an interview", () => {
		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
			createInterview: (protocolId: string, participantId: string) => string;
			getNetworkState: (interviewId: string) => unknown;
		};
		const protocol = makeProtocol({ id: "p-3" });
		testGlobal.installProtocol(protocol);

		const interviewId = testGlobal.createInterview("p-3", "participant-2");
		const network = testGlobal.getNetworkState(interviewId);

		expect(network).toBeDefined();
		expect((network as { nodes: unknown[] }).nodes).toEqual([]);
	});
});

describe("subscribe", () => {
	beforeEach(() => {
		installTestHooks();
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).__test;
	});

	it("calls subscriber when installProtocol is invoked", () => {
		const listener = vi.fn();
		const unsubscribe = subscribe(listener);

		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
		};
		testGlobal.installProtocol(makeProtocol());

		expect(listener).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("calls subscriber when createInterview is invoked", () => {
		const listener = vi.fn();
		const unsubscribe = subscribe(listener);

		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
			createInterview: (protocolId: string, participantId: string) => string;
		};
		const protocol = makeProtocol({ id: "p-4" });
		testGlobal.installProtocol(protocol);
		listener.mockClear();

		testGlobal.createInterview("p-4", "participant-3");
		expect(listener).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("unsubscribe prevents further notifications", () => {
		const listener = vi.fn();
		const unsubscribe = subscribe(listener);
		unsubscribe();

		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
		};
		testGlobal.installProtocol(makeProtocol());

		expect(listener).not.toHaveBeenCalled();
	});

	it("sync handler updates interview session and notifies subscribers", async () => {
		const listener = vi.fn();
		const unsubscribe = subscribe(listener);

		const testGlobal = (globalThis as Record<string, unknown>).__test as {
			installProtocol: (p: ProtocolPayload) => void;
			createInterview: (protocolId: string, participantId: string) => string;
		};
		const protocol = makeProtocol({ id: "p-5" });
		testGlobal.installProtocol(protocol);
		listener.mockClear();

		const interviewId = testGlobal.createInterview("p-5", "participant-4");
		listener.mockClear();

		const state = getTestState();
		const entry = state.interviews.get(interviewId);
		expect(entry).toBeDefined();

		const updatedSession = makeSession({ id: interviewId, currentStep: 3 });
		await state.sync(interviewId, updatedSession);

		expect(state.interviews.get(interviewId)?.session.currentStep).toBe(3);
		expect(listener).toHaveBeenCalledOnce();

		unsubscribe();
	});
});

declare global {
	type Window = {
		__test?: {
			installProtocol: (protocol: ProtocolPayload) => void;
			createInterview: (protocolId: string, participantId: string) => string;
			getNetworkState: (interviewId: string) => unknown;
		};
	};
}
