import { Card, CardHeader, CardContent } from "~/components/ui/card";
import RegionsTable from "../_components/RegionsTable/RegionsTable";
import { RegionsStats } from "./_components/RegionsStats";

export default function RegionsView() {
  return (
    <div className="space-y-4">
      <RegionsStats />
      <Card>
        <CardHeader>Regions</CardHeader>
        <CardContent>
          <RegionsTable />
        </CardContent>
      </Card>
    </div>
  );
}
