import RegionsTable from "../_components/RegionsTable/RegionsTable";
import { RegionsStats } from "./_components/RegionsStats";

export default function RegionsView() {
  return (
    <div className="space-y-4">
      <RegionsStats />
      <div className="p-8">
        <RegionsTable />
      </div>
    </div>
  );
}
