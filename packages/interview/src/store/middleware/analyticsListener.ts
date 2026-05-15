"use client";

import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import type { Tracker } from "~/analytics/tracker";
import { addEdge, addNode, addNodeToPrompt, deleteEdge, deleteNode, removeNodeFromPrompt } from "../modules/session";
import { setPassphrase, setPassphraseInvalid } from "../modules/ui";
import type { AppDispatch, RootState } from "../store";

type AnalyticsListenerArgs = {
	tracker: Tracker;
};

export function createAnalyticsListenerMiddleware({ tracker }: AnalyticsListenerArgs) {
	const analyticsListenerMiddleware = createListenerMiddleware();
	const startAppListening = analyticsListenerMiddleware.startListening as TypedStartListening<RootState, AppDispatch>;

	// node_added — addNode.fulfilled doesn't carry the generated UUID in its
	// payload (the reducer assigns it), so we diff state to find the new node.
	startAppListening({
		actionCreator: addNode.fulfilled,
		effect: (action, listenerApi) => {
			const stateAfter = listenerApi.getState();
			const stateBefore = listenerApi.getOriginalState();
			const before = stateBefore.session.network?.nodes ?? [];
			const after = stateAfter.session.network?.nodes ?? [];
			if (after.length <= before.length) return;
			const newNode = after[after.length - 1];
			if (!newNode) return;
			tracker.track("node_added", {
				node_id: newNode._uid,
				node_type: action.payload?.type,
			});
		},
	});

	startAppListening({
		actionCreator: deleteNode,
		effect: (action) => {
			tracker.track("node_removed", { node_id: action.payload });
		},
	});

	startAppListening({
		actionCreator: addEdge.fulfilled,
		effect: (action) => {
			const payload = action.payload as { edgeId?: string; type?: string } | undefined;
			if (!payload?.edgeId) return;
			tracker.track("edge_created", { edge_id: payload.edgeId, edge_type: payload.type });
		},
	});

	startAppListening({
		actionCreator: deleteEdge,
		effect: (action) => {
			tracker.track("edge_removed", { edge_id: action.payload });
		},
	});

	startAppListening({
		actionCreator: addNodeToPrompt.fulfilled,
		effect: (action) => {
			tracker.track("node_added_to_prompt", { node_id: action.payload?.nodeId });
		},
	});

	startAppListening({
		actionCreator: removeNodeFromPrompt.fulfilled,
		effect: (action) => {
			tracker.track("node_removed_from_prompt", { node_id: action.payload?.nodeId });
		},
	});

	// Anonymisation. The passphrase value itself is never sent.
	startAppListening({
		actionCreator: setPassphrase,
		effect: () => {
			tracker.track("passphrase_set");
		},
	});

	startAppListening({
		actionCreator: setPassphraseInvalid,
		effect: (action) => {
			if (action.payload) {
				tracker.track("passphrase_validation_failed");
			}
		},
	});

	return analyticsListenerMiddleware;
}
