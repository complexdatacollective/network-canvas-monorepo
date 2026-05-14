import { ClipboardList, Download, FileBox, LayoutDashboard, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { APP_NAME, APP_VERSION, PLATFORM } from "../env";

type NavItem = {
	to: string;
	label: string;
	icon: ReactNode;
	matchPrefix?: string;
};

const navItems: NavItem[] = [
	{ to: "/", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
	{ to: "/protocols", label: "Protocols", icon: <FileBox size={18} />, matchPrefix: "/protocols" },
	{ to: "/interviews", label: "Interviews", icon: <ClipboardList size={18} />, matchPrefix: "/interviews" },
	{ to: "/export", label: "Export", icon: <Download size={18} /> },
	{ to: "/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
];

function isActive(currentPath: string, item: NavItem): boolean {
	if (item.matchPrefix) return currentPath === item.to || currentPath.startsWith(`${item.matchPrefix}/`);
	return currentPath === item.to;
}

export default function AppShell({ children }: { children: ReactNode }) {
	const [location] = useLocation();
	return (
		<div className="flex h-full w-full text-foreground">
			<aside
				className="flex w-60 shrink-0 flex-col border-r border-border bg-fresco-purple text-fresco-purple-foreground"
				aria-label="Primary navigation"
			>
				<div className="flex flex-col gap-1 px-5 py-6">
					<span className="text-xs uppercase tracking-widest opacity-70">Network Canvas</span>
					<span className="font-heading text-lg font-bold leading-tight">Interviewer</span>
				</div>
				<nav className="flex flex-1 flex-col gap-1 px-2">
					{navItems.map((item) => {
						const active = isActive(location, item);
						return (
							<Link
								key={item.to}
								href={item.to}
								className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
									active ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
								}`}
							>
								{item.icon}
								<span>{item.label}</span>
							</Link>
						);
					})}
				</nav>
				<div className="border-t border-white/10 px-5 py-4 text-xs text-white/60">
					<div>
						{APP_NAME} v{APP_VERSION}
					</div>
					<div className="capitalize">{PLATFORM} build</div>
				</div>
			</aside>
			<main className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
				<div className="mx-auto w-full max-w-5xl px-8 py-8">{children}</div>
			</main>
		</div>
	);
}
