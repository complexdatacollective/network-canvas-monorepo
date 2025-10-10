"use client";

import { Button } from "@codaco/ui";
import { Bell, LogOut, Menu, Settings, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUser, useSignOut } from "~/hooks/use-auth";

export function DashboardHeader({ onMenuClick }: { onMenuClick: () => void }) {
	const router = useRouter();
	const { data: user } = useCurrentUser();
	const signOut = useSignOut();
	const [showUserMenu, setShowUserMenu] = useState(false);

	const handleSignOut = async () => {
		await signOut.mutateAsync();
		router.push("/login");
	};

	return (
		<header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background px-6">
			<Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
				<Menu className="h-5 w-5" />
			</Button>

			<div className="flex-1">
				<Link href="/dashboard" className="flex items-center gap-2">
					<span className="text-lg font-bold">Fresco Platform</span>
				</Link>
			</div>

			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" title="Notifications">
					<Bell className="h-5 w-5" />
				</Button>

				<div className="relative">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setShowUserMenu(!showUserMenu)}
						title="User menu"
						className="relative"
					>
						<User className="h-5 w-5" />
					</Button>

					{showUserMenu && (
						<>
							<button
								type="button"
								className="fixed inset-0 z-10"
								onClick={() => setShowUserMenu(false)}
								aria-label="Close menu"
								onKeyDown={(e) => {
									if (e.key === "Escape") setShowUserMenu(false);
								}}
							/>
							<div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-md border bg-white shadow-lg">
								<div className="border-b p-4">
									<div className="font-medium text-slate-900">{user?.name || "User"}</div>
									<div className="text-sm text-slate-500">{user?.email}</div>
								</div>
								<div className="p-2">
									<Link
										href="/dashboard/settings"
										className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-slate-100"
										onClick={() => setShowUserMenu(false)}
									>
										<Settings className="h-4 w-4" />
										Settings
									</Link>
									<button
										type="button"
										onClick={handleSignOut}
										className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50"
									>
										<LogOut className="h-4 w-4" />
										Sign out
									</button>
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</header>
	);
}
