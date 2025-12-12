import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import posthog from "posthog-js";
import { z } from "zod";
import { createStage } from "../modules/protocol/stages";
import { setProtocolMeta } from "../modules/protocolMeta";
import { validateProtocolAsync } from "../modules/protocolValidation";
import type { RootState } from "../modules/root";
import { exportNetcanvas } from "../modules/userActions/userActions";
import type { AppDispatch } from "../store";

// Create the listener middleware
export const analyticsListenerMiddleware = createListenerMiddleware();

// Type the start listening function
type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening = analyticsListenerMiddleware.startListening as AppStartListening;

// Track protocol opened (triggered when protocol metadata is set)
startAppListening({
	actionCreator: setProtocolMeta,
	effect: (action, listenerApi) => {
		const state = listenerApi.getState();
		const protocol = state.activeProtocol?.present;
		posthog.capture("protocol_opened", {
			protocol_name: action.payload.name,
			schema_version: protocol?.schemaVersion ?? 8,
			stage_count: protocol?.stages?.length ?? 0,
		});
	},
});

// Track new stage added
startAppListening({
	actionCreator: createStage,
	effect: (action) => {
		posthog.capture("stage_added", {
			stage_type: action.payload.stage.type ?? "unknown",
			stage_index: action.payload.index,
		});
	},
});

// Track protocol validation failed
startAppListening({
	actionCreator: validateProtocolAsync.fulfilled,
	effect: (action) => {
		const { result } = action.payload;
		if (!result.success) {
			const flattenedErrors = z.flattenError(result.error);
			posthog.capture("protocol_validation_failed", {
				error_count: result.error.issues.length,
				error_message: z.prettifyError(result.error),
				form_errors: flattenedErrors.formErrors,
				field_errors: flattenedErrors.fieldErrors,
			});
		}
	},
});

// Track protocol downloaded (exported)
startAppListening({
	actionCreator: exportNetcanvas.fulfilled,
	effect: (_action, listenerApi) => {
		const state = listenerApi.getState();
		const protocol = state.activeProtocol?.present;
		const protocolMeta = state.protocolMeta;
		posthog.capture("protocol_downloaded", {
			protocol_name: protocolMeta?.name,
			stage_count: protocol?.stages?.length ?? 0,
		});
	},
});
