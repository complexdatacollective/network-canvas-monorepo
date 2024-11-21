import type { Event } from "~/app/_actions/actions";

export const getTotalInterviewsStarted = (events: Event[]) => {
	const nInterviewsStarted = events.reduce((count, event) => {
		if (event.type === "InterviewStarted") {
			return count + 1;
		}
		return count;
	}, 0);

	return nInterviewsStarted;
};
