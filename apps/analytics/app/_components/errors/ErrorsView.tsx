import { ErrorsStats } from "./ErrorsStats";
import ErrorsTable from "./ErrorsTable/ErrorsTable";
import TotalErrorsCard from "./cards/TotalErrorsCard";

export default function ErrorsView() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ErrorsStats />
      </div>
      <ErrorsTable />
    </div>
  );
}
