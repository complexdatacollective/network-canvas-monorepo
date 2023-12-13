import { AnalyticsStats } from "./_components/AnalyticsStats";
import EventsTable from "./_components/EventsTable/EventsTable";

export default function AnalyticsView() {
  return (
    <div className="space-y-4">
      <AnalyticsStats />

      <EventsTable />
    </div>
  );
}
