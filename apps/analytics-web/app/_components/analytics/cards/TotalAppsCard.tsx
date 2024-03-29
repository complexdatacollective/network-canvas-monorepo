import { getTotalAppsSetup } from '~/utils/getTotalAppsSetup';
import { SummaryCard } from '~/components/SummaryCard';
import { type Event } from '~/app/_actions/actions';

const TotalAppsCard = ({ events }: { events: Event[] }) => {
  const totalAppsSetup = getTotalAppsSetup(events);
  return (
    <SummaryCard
      title="Apps Setup"
      value={totalAppsSetup}
      description="Total apps setup across all instances of Fresco"
    />
  );
};

export default TotalAppsCard;
