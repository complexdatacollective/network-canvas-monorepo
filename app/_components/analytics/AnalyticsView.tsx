import TotalAppsCard from "./cards/TotalAppsCard";
import TotalInterviewsCompletedCard from "./cards/TotalInterviewsCompletedCard";
import TotalInterviewsStartedCard from "./cards/TotalInterviewsStartedCard";
import TotalProtocolsInstalledCard from "./cards/TotalProtocolsInstalledCard";

export default function AnalyticsView() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <TotalAppsCard />
      <TotalProtocolsInstalledCard />
      <TotalInterviewsStartedCard />
      <TotalInterviewsCompletedCard />
    </div>
  );
}
