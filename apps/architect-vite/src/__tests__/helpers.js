/* eslint-disable import/prefer-default-export */

import developmentProtocol from "@codaco/development-protocol";
import testState from "./testState.json" with { type: "json" };

export const getMockState = (mergeProps) => ({
	...testState,
	protocol: {
		present: developmentProtocol,
	},
	...mergeProps,
});
