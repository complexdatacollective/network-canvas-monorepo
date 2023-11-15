import { Card, CardHeader, CardContent } from "~/components/ui/card";
import EventsTable from "./EventsTable/EventsTable";
import TotalAppsCard from "./cards/TotalAppsCard";
import TotalInterviewsCompletedCard from "./cards/TotalInterviewsCompletedCard";
import TotalInterviewsStartedCard from "./cards/TotalInterviewsStartedCard";
import TotalProtocolsInstalledCard from "./cards/TotalProtocolsInstalledCard";
import RegionsTable from "./RegionsTable/RegionsTable";

export default function AnalyticsView() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TotalAppsCard />
        <TotalProtocolsInstalledCard />
        <TotalInterviewsStartedCard />
        <TotalInterviewsCompletedCard />
      </div>
      <div className="grid gap-4 grid-cols-2">
        <EventsTable />
        <Card>
          <CardHeader>Regions</CardHeader>
          <CardContent>
            <RegionsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
