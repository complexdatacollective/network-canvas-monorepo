import { getTotalInterviewsStarted } from '~/utils/getTotalInterviewsStarted';
import { SummaryCard } from '~/components/SummaryCard';
import { type Event } from '~/app/_actions/actions';

const TotalInterviewsStartedCard = ({ events }: { events: Event[] }) => {
  const totalInterviewsStarted = getTotalInterviewsStarted(events);
  return (
    <SummaryCard
      title="Interviews Started"
      value={totalInterviewsStarted}
      description="Total interviews started across all instances of Fresco"
    />
  );
};

export default TotalInterviewsStartedCard;
