import { getEvents } from '~/app/_actions/actions';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import EventsTable from './EventsTable/EventsTable';
import RegionsTable from './RegionsTable/RegionsTable';
import TotalAppsCard from './cards/TotalAppsCard';
import TotalDataExported from './cards/TotalDataExported';
import TotalErrorsCard from './cards/TotalErrorsCard';
import TotalInterviewsCompletedCard from './cards/TotalInterviewsCompletedCard';
import TotalInterviewsStartedCard from './cards/TotalInterviewsStartedCard';
import TotalProtocolsInstalledCard from './cards/TotalProtocolsInstalledCard';

export default async function AnalyticsView() {
  const events = await getEvents();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TotalAppsCard events={events} />
        <TotalProtocolsInstalledCard events={events} />
        <TotalInterviewsStartedCard events={events} />
        <TotalInterviewsCompletedCard events={events} />
        <TotalDataExported events={events} />
        <TotalErrorsCard events={events} />
      </div>
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EventsTable />
        </div>
        <Card className="h-fit">
          <CardHeader>Regions</CardHeader>
          <CardContent>
            <RegionsTable events={events} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
