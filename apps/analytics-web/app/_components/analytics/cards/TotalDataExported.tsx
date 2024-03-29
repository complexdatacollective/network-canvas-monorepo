import { getTotalInterviewsStarted } from '~/utils/getTotalInterviewsStarted';
import { SummaryCard } from '~/components/SummaryCard';
import { type Event } from '~/app/_actions/actions';

const TotalDataExported = ({ events }: { events: Event[] }) => {
  const totalInterviewsStarted = getTotalInterviewsStarted(events);
  return (
    <SummaryCard
      title="Data Exported"
      value={totalInterviewsStarted}
      description="Total data exported across all instances of Fresco"
    />
  );
};

export default TotalDataExported;
