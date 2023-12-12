import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { AnalyticsStats } from "./_components/AnalyticsStats";
import EventsTable from "./_components/EventsTable/EventsTable";
import RegionsTable from "./_components/RegionsTable/RegionsTable";

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
