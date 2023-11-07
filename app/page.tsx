import getErrors from "@/db/getErrors";
import TotalAppsCard from "@/components/dashboard/TotalAppsCard";
import TotalProtocolsInstalledCard from "@/components/dashboard/TotalProtocolsInstalledCard";

export default async function DashboardPage() {
  const errors = await getErrors();

  return (
    <main>
      <div className="p-12">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TotalAppsCard />
          <TotalProtocolsInstalledCard />
        </div>
      </div>
    </main>
  );
}
