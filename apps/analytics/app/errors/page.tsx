import { ErrorsStats } from "./_components/ErrorsStats";
import ErrorsTable from "./_components/ErrorsTable/ErrorsTable";

export default function ErrorsView() {
  return (
    <div className="space-y-4">
      <ErrorsStats />
      <div className="p-8">
        <ErrorsTable />
      </div>
    </div>
  );
}
