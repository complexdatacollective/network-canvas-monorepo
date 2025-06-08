import { get, last } from "lodash";

export const getLocus = (state) => last(get(state, ["protocol", "timeline"]));

export const hasChanges = (state, locus) => {
	// If no locus is provided, there are no timeline changes to consider
	if (!locus) {
		return false;
	}
	
	const { timeline } = state.protocol;
	const locusIndex = timeline.findIndex((id) => id === locus);
	
	// If locus is not found in timeline, no changes
	if (locusIndex === -1) {
		return false;
	}
	
	// Changes exist if current locus is not the last item in timeline
	return locusIndex < timeline.length - 1;
};
