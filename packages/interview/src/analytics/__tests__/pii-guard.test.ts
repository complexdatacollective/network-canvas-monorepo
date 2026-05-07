import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { createAnalyticsListenerMiddleware } from "../../store/middleware/analyticsListener";
import protocol from "../../store/modules/protocol";
import session, { addEdge, addNode, deleteEdge, deleteNode } from "../../store/modules/session";
import ui from "../../store/modules/ui";
import type { Tracker } from "../tracker";

const SENTINELS = [
	"CODEBOOK_LABEL_TRIGGER",
	"PROMPT_TEXT_TRIGGER",
	"NODE_LABEL_TRIGGER",
	"PARTICIPANT_INPUT_TRIGGER",
	"PASSPHRASE_TRIGGER",
];

function containsSentinel(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "string") return SENTINELS.some((s) => value.includes(s));
	if (typeof value === "object") {
		return Object.values(value as Record<string, unknown>).some(containsSentinel);
	}
	return false;
}

function buildStore(tracker: Tracker) {
	return configureStore({
		reducer: { session, protocol, ui },
		preloadedState: {
			session: {
				id: "interview-1",
				startTime: new Date().toISOString(),
				lastUpdated: new Date().toISOString(),
				network: {
					ego: { _uid: "ego", PARTICIPANT_INPUT_TRIGGER: "value" },
					nodes: [{ _uid: "n1", type: "person", attributes: { label: "NODE_LABEL_TRIGGER" }, promptIDs: [] }],
					edges: [],
				},
				promptIndex: 0,
			} as never,
			protocol: {
				id: "p1",
				hash: "h1",
				schemaVersion: 8,
				name: "PROMPT_TEXT_TRIGGER",
				description: "PROMPT_TEXT_TRIGGER",
				codebook: {
					node: { person: { name: "CODEBOOK_LABEL_TRIGGER", color: "blue", variables: {} } },
				},
				stages: [{ id: "s0", type: "Information" }],
			} as never,
		},
		middleware: (g) =>
			g({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
	});
}

describe("PII guard — global listener events never leak sentinels", () => {
	it("emits no event whose name or properties contain author-authored or participant-input strings", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);

		// Exercise actions that trigger listeners
		await store.dispatch(
			addNode({
				type: "person",
				attributeData: { label: "NODE_LABEL_TRIGGER" },
				modelData: { stageId: "s0" },
				currentStep: 0,
				allowUnknownAttributes: true,
			} as never) as never,
		);
		store.dispatch(deleteNode("n1") as never);
		await store.dispatch(
			addEdge({
				from: "ego",
				to: "n1",
				type: "knows",
				currentStep: 0,
			} as never) as never,
		);
		store.dispatch(deleteEdge("e1") as never);

		for (const call of tracker.track.mock.calls) {
			const [eventName, props] = call;
			expect(containsSentinel(eventName), `event name leaked: ${eventName}`).toBe(false);
			expect(containsSentinel(props), `event props leaked sentinel: ${JSON.stringify(props)}`).toBe(false);
		}
	});
});
