import type { Event } from "~/app/_actions/actions";
import { SummaryCard } from "~/components/SummaryCard";
import { getTotalProtocolsInstalled } from "~/utils/getTotalProtocolsInstalled";

const TotalProtocolsInstalledCard = ({ events }: { events: Event[] }) => {
	const totalProtocolsInstalled = getTotalProtocolsInstalled(events);
	return (
		<SummaryCard
			title="Protocols Installed"
			value={totalProtocolsInstalled}
			description="Total protocols installed across all instances of Fresco"
		/>
	);
};

export default TotalProtocolsInstalledCard;
