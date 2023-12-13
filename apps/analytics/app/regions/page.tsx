import RegionsTable from "../_components/RegionsTable/RegionsTable";
import { RegionsStats } from "./_components/RegionsStats";

export default function RegionsView() {
  return (
    <div className="space-y-4">
      <RegionsStats />
      <div className="p-8">
        <div className="flex justify-between">
          <h2 className="font-semibold text-white pb-4">Top Regions</h2>
        </div>
        <RegionsTable />
      </div>
    </div>
  );
}
