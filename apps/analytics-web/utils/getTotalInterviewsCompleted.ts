import type { Event } from "~/app/_actions/actions";

export const getTotalInterviewsCompleted = (events: Event[]) => {
	const nInterviewsCompleted = events.reduce((count, event) => {
		if (event.type === "InterviewCompleted") {
			return count + 1;
		}
		return count;
	}, 0);

	return nInterviewsCompleted;
};
