import TotalAppsCard from "./TotalAppsCard";
import TotalProtocolsInstalledCard from "./TotalProtocolsInstalledCard";

export default function AnalyticsView() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <TotalAppsCard />
      <TotalProtocolsInstalledCard />
    </div>
  );
}
