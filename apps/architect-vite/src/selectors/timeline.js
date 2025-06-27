import { get, last } from "lodash";
import { getProtocol } from "./protocol";

export const getLocus = (state) => {
	const protocol = getProtocol(state);
	return last(get(protocol, ["timeline"]));
};

export const hasChanges = (state, locus) => {
	// If no locus is provided, there are no timeline changes to consider
	if (!locus) {
		return false;
	}

	const protocol = getProtocol(state);
	if (!protocol?.timeline) {
		return false;
	}

	const { timeline } = protocol;
	const locusIndex = timeline.findIndex((id) => id === locus);

	// If locus is not found in timeline, no changes
	if (locusIndex === -1) {
		return false;
	}

	// Changes exist if current locus is not the last item in timeline
	return locusIndex < timeline.length - 1;
};
