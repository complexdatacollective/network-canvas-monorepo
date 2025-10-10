"use client";

import { cn } from "@codaco/ui";
import { HelpCircle, LayoutDashboard, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
	href: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
	{
		href: "/dashboard",
		label: "Applications",
		icon: LayoutDashboard,
	},
	{
		href: "/dashboard/settings",
		label: "Settings",
		icon: Settings,
	},
	{
		href: "/dashboard/support",
		label: "Support",
		icon: HelpCircle,
	},
];

type DashboardSidebarProps = {
	isOpen: boolean;
	onClose: () => void;
};

export function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
	const pathname = usePathname();

	return (
		<>
			{isOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} aria-hidden="true" />}

			<aside
				className={cn(
					"fixed left-0 top-0 z-50 h-screen w-64 border-r bg-background transition-transform duration-200 md:sticky md:translate-x-0",
					isOpen ? "translate-x-0" : "-translate-x-full",
				)}
			>
				<div className="flex h-16 items-center border-b px-6">
					<Link href="/dashboard" className="flex items-center gap-2">
						<span className="text-lg font-bold">Fresco Platform</span>
					</Link>
				</div>

				<nav className="flex flex-col gap-1 p-4">
					{navItems.map((item) => {
						const Icon = item.icon;
						const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

						return (
							<Link
								key={item.href}
								href={item.href}
								onClick={onClose}
								className={cn(
									"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
									isActive
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
								)}
							>
								<Icon className="h-5 w-5" />
								{item.label}
							</Link>
						);
					})}
				</nav>

				<div className="absolute bottom-0 w-full border-t p-4">
					<button
						type="button"
						className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<LogOut className="h-5 w-5" />
						Sign Out
					</button>
				</div>
			</aside>
		</>
	);
}
