import { getTotalInterviewsStarted } from '~/utils/getTotalInterviewsStarted';
import { SummaryCard } from '~/components/SummaryCard';

const TotalInterviewsStartedCard = async () => {
  const totalInterviewsStarted = await getTotalInterviewsStarted();
  return (
    <SummaryCard
      title="Interviews Started"
      value={totalInterviewsStarted}
      description="Total interviews started across all instances of Fresco"
    />
  );
};

export default TotalInterviewsStartedCard;
