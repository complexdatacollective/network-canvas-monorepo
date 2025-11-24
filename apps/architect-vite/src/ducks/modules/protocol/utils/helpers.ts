/* eslint-disable import/prefer-default-export */

import {
	type CurrentProtocol,
	type EdgeColor,
	EdgeColorSequence,
	type NodeColor,
	NodeColorSequence,
} from "@codaco/protocol-validation";
import { get, size } from "lodash";

export const getNextCategoryColor = (protocol: CurrentProtocol, entity: "node" | "edge") => {
	if (entity === "node") {
		const typeCount = size(get(protocol, ["codebook", entity], {})); // number of existing node types
		const nextNumber = (typeCount % NodeColorSequence.length) + 1; // wrap around if exceeding palette size
		return NodeColorSequence[nextNumber - 1] as NodeColor;
	}

	const typeCount = size(get(protocol, ["codebook", entity], {})); // number of existing edge types
	const nextNumber = (typeCount % EdgeColorSequence.length) + 1;
	return EdgeColorSequence[nextNumber - 1] as EdgeColor;
};
