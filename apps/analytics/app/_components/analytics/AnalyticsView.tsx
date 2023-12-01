import { Card, CardHeader, CardContent } from "~/components/ui/card";
import EventsTable from "./EventsTable/EventsTable";

import RegionsTable from "./RegionsTable/RegionsTable";
import { AnalyticsStats } from "./AnalyticsStats";

export default function AnalyticsView() {
  return (
    <div className="space-y-4">
      <AnalyticsStats />
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
