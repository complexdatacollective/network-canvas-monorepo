import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import posthog from "posthog-js";
import { z } from "zod";
import { setActiveProtocol } from "../modules/activeProtocol";
import { createStage } from "../modules/protocol/stages";
import { validateProtocolAsync } from "../modules/protocolValidation";
import type { RootState } from "../modules/root";
import { exportNetcanvas } from "../modules/userActions/userActions";
import type { AppDispatch } from "../store";

// Create the listener middleware
export const analyticsListenerMiddleware = createListenerMiddleware();

// Type the start listening function
type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening = analyticsListenerMiddleware.startListening as AppStartListening;

// Track protocol opened
startAppListening({
	actionCreator: setActiveProtocol,
	effect: (action) => {
		posthog.capture("protocol_opened", {
			protocol_name: action.payload.name,
			schema_version: action.payload.schemaVersion,
			stage_count: action.payload.stages?.length ?? 0,
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
		posthog.capture("protocol_downloaded", {
			protocol_name: protocol?.name,
			stage_count: protocol?.stages?.length ?? 0,
		});
	},
});
