import type { Event } from "~/app/_actions/actions";
import { SummaryCard } from "~/components/SummaryCard";
import { getTotalDataExported } from "~/utils/getTotalDataExported";

export const TotalDataExported = ({ events }: { events: Event[] }) => {
	const totalDataExported = getTotalDataExported(events);
	return (
		<SummaryCard
			title="Data Exported"
			value={totalDataExported}
			description="Total data exported across all instances of Fresco"
		/>
	);
};
