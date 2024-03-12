import { UserButton } from '@clerk/nextjs';
import AnalyticsView from '~/app/_components/analytics/AnalyticsView';
import UserManagementDialog from './_components/users/UserManagementDialog';

export default function DashboardPage() {
  return (
    <main>
      <div className="space-y-4 p-12">
        <div className="flex flex-row justify-between">
          <h2 className="flex flex-row text-3xl font-bold">Dashboard</h2>
          <div className="flex flex-row">
            <UserManagementDialog />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        <AnalyticsView />
      </div>
    </main>
  );
}
