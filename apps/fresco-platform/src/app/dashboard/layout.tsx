"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthGuard } from "../../components/auth/auth-guard";
import { DashboardHeader } from "../../components/dashboard/dashboard-header";
import { DashboardSidebar } from "../../components/dashboard/dashboard-sidebar";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60,
			refetchOnWindowFocus: false,
		},
	},
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	const [sidebarOpen, setSidebarOpen] = useState(false);

	return (
		<QueryClientProvider client={queryClient}>
			<AuthGuard>
				<div className="flex h-screen overflow-hidden">
					<DashboardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

					<div className="flex flex-1 flex-col overflow-hidden">
						<DashboardHeader onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

						<main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
					</div>
				</div>
			</AuthGuard>
		</QueryClientProvider>
	);
}
