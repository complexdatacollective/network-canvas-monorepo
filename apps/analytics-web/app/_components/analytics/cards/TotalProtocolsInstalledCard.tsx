import { getTotalProtocolsInstalled } from '~/utils/getTotalProtocolsInstalled';
import { SummaryCard } from '~/components/SummaryCard';
import { type Event } from '~/app/_actions/actions';

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
