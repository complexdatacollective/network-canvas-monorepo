import { Card, CardHeader, CardContent } from "~/components/ui/card";
import EventsTable from "./EventsTable/EventsTable";
import TotalAppsCard from "./cards/TotalAppsCard";
import TotalInterviewsCompletedCard from "./cards/TotalInterviewsCompletedCard";
import TotalInterviewsStartedCard from "./cards/TotalInterviewsStartedCard";
import TotalProtocolsInstalledCard from "./cards/TotalProtocolsInstalledCard";

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
            <div className="h-64 bg-gray-100 rounded-md flex flex-col justify-center items-center">
              <p className="text-gray-600">Visualization goes here</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
