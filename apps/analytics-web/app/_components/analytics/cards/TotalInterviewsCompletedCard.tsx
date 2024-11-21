import type { Event } from "~/app/_actions/actions";
import { SummaryCard } from "~/components/SummaryCard";
import { getTotalInterviewsCompleted } from "~/utils/getTotalInterviewsCompleted";

const TotalAppsCard = ({ events }: { events: Event[] }) => {
	const totalInterviewsCompleted = getTotalInterviewsCompleted(events);
	return (
		<SummaryCard
			title="Interviews Completed"
			value={totalInterviewsCompleted}
			description="Total interviews completed across all instances of Fresco"
		/>
	);
};

export default TotalAppsCard;
