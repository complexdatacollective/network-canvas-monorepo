import { SummaryCard } from "@/components/SummaryCard";
import getErrors from "@/db/getErrors";

const TotalErrorsCard = async () => {
  const errors = await getErrors();
  const totalErrors = errors.length;
  return <SummaryCard title="Number of Errors" value={totalErrors} />;
};

export default TotalErrorsCard;
