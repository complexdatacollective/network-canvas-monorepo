import { SummaryCard } from "~/components/SummaryCard";
import { getTotalErrors } from "~/utils/getTotalErrors";

const TotalErrorsCard = async () => {
  const totalErrors = await getTotalErrors();
  return (
    <SummaryCard
      title="Number of Errors"
      value={totalErrors}
      description="Total number of errors sent from all instances of Fresco"
    />
  );
};

export default TotalErrorsCard;
