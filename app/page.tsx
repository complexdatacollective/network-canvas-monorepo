import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AnalyticsView from "@/app/_components/analytics/AnalyticsView";
import ErrorsView from "@/app/_components/errors/ErrorsView";
import { UserButton } from "@clerk/nextjs";

export default function DashboardPage() {
  return (
    <main>
      <div className="p-12 space-y-4">
        <div className="flex flex-row justify-between">
          <h2 className="text-3xl font-bold flex flex-row">Dashboard</h2>
          <UserButton afterSignOutUrl="/" />
        </div>

        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
          </TabsList>
          <TabsContent value="analytics">
            <AnalyticsView />
          </TabsContent>
          <TabsContent value="errors">
            <ErrorsView />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
