import { type Event } from '~/app/_actions/actions';
import { SummaryCard } from '~/components/SummaryCard';
import { getTotalErrors } from '~/utils/getTotalErrors';

const TotalErrorsCard = ({ events }: { events: Event[] }) => {
  const totalErrors = getTotalErrors(events);
  return (
    <SummaryCard
      title="Number of Errors"
      value={totalErrors}
      description="Total number of errors sent from all instances of Fresco"
    />
  );
};

export default TotalErrorsCard;
