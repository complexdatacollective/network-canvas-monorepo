import { getTotalInterviewsCompleted } from '~/utils/getTotalInterviewsCompleted';
import { SummaryCard } from '~/components/SummaryCard';

const TotalAppsCard = async () => {
  const totalInterviewsCompleted = await getTotalInterviewsCompleted();
  return (
    <SummaryCard
      title="Interviews Completed"
      value={totalInterviewsCompleted}
      description="Total interviews completed across all instances of Fresco"
    />
  );
};

export default TotalAppsCard;
