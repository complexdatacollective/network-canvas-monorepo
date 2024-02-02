import { Card, CardHeader, CardContent } from "~/components/ui/card";
import EventsTable from "./EventsTable/EventsTable";
import TotalAppsCard from "./cards/TotalAppsCard";
import TotalInterviewsCompletedCard from "./cards/TotalInterviewsCompletedCard";
import TotalInterviewsStartedCard from "./cards/TotalInterviewsStartedCard";
import TotalProtocolsInstalledCard from "./cards/TotalProtocolsInstalledCard";
import RegionsTable from "./RegionsTable/RegionsTable";
import getEvents from "~/db/getEvents";
import TotalErrorsCard from "./cards/TotalErrorsCard";
import TotalDataExported from "./cards/TotalDataExported";

export default async function AnalyticsView() {
  const events = await getEvents();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TotalAppsCard />
        <TotalProtocolsInstalledCard />
        <TotalInterviewsStartedCard />
        <TotalInterviewsCompletedCard />
        <TotalDataExported />
        <TotalErrorsCard />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 md:grid-cols-2 sm:grid-cols-1">
        <div className="lg:col-span-2">
          <EventsTable events={events} />
        </div>
        <Card className="h-fit">
          <CardHeader>Regions</CardHeader>
          <CardContent>
            <RegionsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
