import { SummaryCard } from '~/components/SummaryCard';
import { type Event } from '~/app/_actions/actions';
import { getTotalDataExported } from '~/utils/getTotalDataExported';

const TotalDataExported = ({ events }: { events: Event[] }) => {
  const totalDataExported = getTotalDataExported(events);
  return (
    <SummaryCard
      title="Data Exported"
      value={totalDataExported}
      description="Total data exported across all instances of Fresco"
    />
  );
};

export default TotalDataExported;
