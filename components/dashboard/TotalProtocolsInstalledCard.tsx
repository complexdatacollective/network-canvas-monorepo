import { getTotalProtocolsInstalled } from "@/utils/getTotalProtocolsInstalled";
import { SummaryCard } from "./SummaryCard";

const TotalProtocolsInstalledCard = async () => {
  const totalProtocolsInstalled = await getTotalProtocolsInstalled();
  return (
    <SummaryCard
      title="Total Protocols Installed"
      value={totalProtocolsInstalled}
      description="Total protocols installed across all instances of Fresco"
    />
  );
};

export default TotalProtocolsInstalledCard;
