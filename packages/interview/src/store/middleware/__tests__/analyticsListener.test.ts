import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { Tracker } from "../../../analytics/tracker";
import protocol from "../../modules/protocol";
import session, {
	addEdge,
	addNode,
	addNodeToPrompt,
	deleteEdge,
	deleteNode,
	removeNodeFromPrompt,
} from "../../modules/session";
import ui, { setPassphrase, setPassphraseInvalid } from "../../modules/ui";
import { createAnalyticsListenerMiddleware } from "../analyticsListener";

function makeTracker() {
	const track = vi.fn<Tracker["track"]>();
	const captureException = vi.fn<Tracker["captureException"]>();
	return { track, captureException } satisfies Tracker;
}

function buildStore(tracker: Tracker, networkOverrides: { nodes?: unknown[]; edges?: unknown[] } = {}) {
	return configureStore({
		reducer: { session, protocol, ui },
		preloadedState: {
			session: {
				id: "i1",
				startTime: new Date().toISOString(),
				lastUpdated: new Date().toISOString(),
				network: {
					ego: { _uid: "ego" },
					nodes: networkOverrides.nodes ?? [],
					edges: networkOverrides.edges ?? [],
				},
				promptIndex: 0,
			} as never,
			protocol: {
				id: "p",
				hash: "h",
				schemaVersion: 8,
				codebook: {
					node: { person: { name: "Person", color: "blue", variables: {} } },
				},
				stages: [
					{ id: "s0", type: "Information" },
					{ id: "s1", type: "NameGenerator", prompts: [{ id: "p1" }] },
				],
			} as never,
		},
		middleware: (g) =>
			g({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
	});
}

describe("analyticsListener — global entity events", () => {
	it("emits node_added with node_id and node_type when addNode fulfills", async () => {
		const tracker = makeTracker();
		const store = buildStore(tracker);
		await store.dispatch(
			addNode({
				type: "person",
				attributeData: {},
				modelData: { stageId: "s1", promptId: "p1" },
				currentStep: 1,
				allowUnknownAttributes: true,
			} as never) as never,
		);
		expect(tracker.track).toHaveBeenCalledWith(
			"node_added",
			expect.objectContaining({ node_id: expect.any(String), node_type: "person" }),
		);
	});

	it("emits node_removed on deleteNode", () => {
		const tracker = makeTracker();
		const store = buildStore(tracker);
		store.dispatch(deleteNode("node-1") as never);
		expect(tracker.track).toHaveBeenCalledWith("node_removed", { node_id: "node-1" });
	});

	it("emits edge_created with edge_id and edge_type when addEdge fulfills", async () => {
		const tracker = makeTracker();
		const store = buildStore(tracker, {
			nodes: [
				{ _uid: "a", type: "person", attributes: {}, promptIDs: [], stageId: "s1" },
				{ _uid: "b", type: "person", attributes: {}, promptIDs: [], stageId: "s1" },
			],
		});
		await store.dispatch(
			addEdge({
				from: "a",
				to: "b",
				type: "knows",
				currentStep: 1,
			} as never) as never,
		);
		const edgeCall = tracker.track.mock.calls.find(([n]) => n === "edge_created");
		expect(edgeCall).toBeTruthy();
		expect(edgeCall?.[1]).toMatchObject({ edge_id: expect.any(String), edge_type: "knows" });
	});

	it("emits edge_removed on deleteEdge", () => {
		const tracker = makeTracker();
		const store = buildStore(tracker);
		store.dispatch(deleteEdge("edge-1") as never);
		expect(tracker.track).toHaveBeenCalledWith("edge_removed", { edge_id: "edge-1" });
	});

	it("emits node_added_to_prompt", async () => {
		const tracker = makeTracker();
		const store = buildStore(tracker, {
			nodes: [{ _uid: "n1", type: "person", attributes: {}, promptIDs: [], stageId: "s1" }],
		});
		await store.dispatch(
			addNodeToPrompt({
				nodeId: "n1",
				promptAttributes: {},
				currentStep: 1,
			} as never) as never,
		);
		const call = tracker.track.mock.calls.find(([n]) => n === "node_added_to_prompt");
		expect(call?.[1]).toMatchObject({ node_id: "n1" });
	});

	it("emits node_removed_from_prompt", async () => {
		const tracker = makeTracker();
		const store = buildStore(tracker, {
			nodes: [{ _uid: "n1", type: "person", attributes: {}, promptIDs: ["p1"], stageId: "s1" }],
		});
		await store.dispatch(
			removeNodeFromPrompt({
				nodeId: "n1",
				currentStep: 1,
			} as never) as never,
		);
		const call = tracker.track.mock.calls.find(([n]) => n === "node_removed_from_prompt");
		expect(call?.[1]).toMatchObject({ node_id: "n1" });
	});
});

describe("analyticsListener — anonymisation", () => {
	it("emits passphrase_set on setPassphrase (no value sent)", () => {
		const tracker = makeTracker();
		const store = buildStore(tracker);
		store.dispatch(setPassphrase("DO_NOT_LEAK"));
		expect(tracker.track).toHaveBeenCalledWith("passphrase_set");
		const allArgs = JSON.stringify(tracker.track.mock.calls);
		expect(allArgs).not.toContain("DO_NOT_LEAK");
	});

	it("emits passphrase_validation_failed on setPassphraseInvalid(true) only", () => {
		const tracker = makeTracker();
		const store = buildStore(tracker);
		store.dispatch(setPassphraseInvalid(true));
		expect(tracker.track).toHaveBeenCalledWith("passphrase_validation_failed");
		tracker.track.mockClear();
		store.dispatch(setPassphraseInvalid(false));
		expect(tracker.track).not.toHaveBeenCalled();
	});
});
