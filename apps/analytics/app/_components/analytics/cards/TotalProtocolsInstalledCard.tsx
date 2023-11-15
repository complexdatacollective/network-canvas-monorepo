import { getTotalProtocolsInstalled } from "~/utils/getTotalProtocolsInstalled";
import { SummaryCard } from "~/components/SummaryCard";

const TotalProtocolsInstalledCard = async () => {
  const totalProtocolsInstalled = await getTotalProtocolsInstalled();
  return (
    <SummaryCard
      title="Protocols Installed"
      value={totalProtocolsInstalled}
      description="Total protocols installed across all instances of Fresco"
    />
  );
};

export default TotalProtocolsInstalledCard;
