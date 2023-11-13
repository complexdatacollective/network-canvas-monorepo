import { getTotalAppsSetup } from "@/utils/getTotalAppsSetup";
import { SummaryCard } from "@/components/SummaryCard";

const TotalAppsCard = async () => {
  const totalAppsSetup = await getTotalAppsSetup();
  return (
    <SummaryCard
      title="Apps Setup"
      value={totalAppsSetup}
      description="Total apps setup across all instances of Fresco"
    />
  );
};

export default TotalAppsCard;
