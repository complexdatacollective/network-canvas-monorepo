import { Card, CardHeader, CardContent } from "~/components/ui/card";
import { ErrorsStats } from "./_components/ErrorsStats";
import ErrorsTable from "./_components/ErrorsTable/ErrorsTable";

export default function ErrorsView() {
  return (
    <div className="space-y-4">
      <ErrorsStats />
      Latest Errors
      <Card>
        <CardHeader>Latest Errors</CardHeader>
        <CardContent>
          <ErrorsTable />
        </CardContent>
      </Card>
    </div>
  );
}
