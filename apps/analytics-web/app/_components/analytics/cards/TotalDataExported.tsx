import { getTotalInterviewsStarted } from '~/utils/getTotalInterviewsStarted';
import { SummaryCard } from '~/components/SummaryCard';

const TotalDataExported = async () => {
  const totalInterviewsStarted = await getTotalInterviewsStarted();
  return (
    <SummaryCard
      title="Data Exported"
      value={totalInterviewsStarted}
      description="Total data exported across all instances of Fresco"
    />
  );
};

export default TotalDataExported;
