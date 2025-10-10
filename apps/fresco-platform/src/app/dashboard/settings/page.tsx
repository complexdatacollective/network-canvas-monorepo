"use client";

import { Button, Input, Label } from "@codaco/ui";
import { Bell, CreditCard, Key, Lock, User } from "lucide-react";
import { useState } from "react";

type SettingsSection = "account" | "security" | "notifications" | "billing" | "api";

export default function SettingsPage() {
	const [activeSection, setActiveSection] = useState<SettingsSection>("account");
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = async (_section: string) => {
		setIsSaving(true);
		await new Promise((resolve) => setTimeout(resolve, 1000));
		setIsSaving(false);
	};

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-gray-900">Settings</h1>
				<p className="mt-1 text-sm text-gray-500">Manage your account and preferences</p>
			</div>

			<div className="flex gap-8">
				<aside className="w-64 flex-shrink-0">
					<nav className="space-y-1 rounded-lg border bg-white p-2">
						<button
							type="button"
							onClick={() => setActiveSection("account")}
							className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
								activeSection === "account" ? "bg-primary text-primary-foreground" : "text-gray-700 hover:bg-gray-100"
							}`}
						>
							<User className="h-5 w-5" />
							Account
						</button>
						<button
							type="button"
							onClick={() => setActiveSection("security")}
							className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
								activeSection === "security" ? "bg-primary text-primary-foreground" : "text-gray-700 hover:bg-gray-100"
							}`}
						>
							<Lock className="h-5 w-5" />
							Security
						</button>
						<button
							type="button"
							onClick={() => setActiveSection("notifications")}
							className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
								activeSection === "notifications"
									? "bg-primary text-primary-foreground"
									: "text-gray-700 hover:bg-gray-100"
							}`}
						>
							<Bell className="h-5 w-5" />
							Notifications
						</button>
						<button
							type="button"
							onClick={() => setActiveSection("billing")}
							className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
								activeSection === "billing" ? "bg-primary text-primary-foreground" : "text-gray-700 hover:bg-gray-100"
							}`}
						>
							<CreditCard className="h-5 w-5" />
							Billing
							<span className="ml-auto rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Soon</span>
						</button>
						<button
							type="button"
							onClick={() => setActiveSection("api")}
							className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
								activeSection === "api" ? "bg-primary text-primary-foreground" : "text-gray-700 hover:bg-gray-100"
							}`}
						>
							<Key className="h-5 w-5" />
							API Keys
							<span className="ml-auto rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Soon</span>
						</button>
					</nav>
				</aside>

				<main className="flex-1">
					{activeSection === "account" && (
						<div className="rounded-lg border bg-white p-6">
							<h2 className="mb-6 text-xl font-semibold text-gray-900">Account Information</h2>

							<form
								onSubmit={(e) => {
									e.preventDefault();
									handleSave("account");
								}}
								className="space-y-6"
							>
								<div>
									<Label htmlFor="name">Full Name</Label>
									<Input id="name" type="text" placeholder="John Doe" defaultValue="John Doe" className="mt-2" />
								</div>

								<div>
									<Label htmlFor="email">Email Address</Label>
									<Input
										id="email"
										type="email"
										placeholder="john@example.com"
										defaultValue="john@example.com"
										className="mt-2"
									/>
									<p className="mt-1 text-sm text-gray-500">We'll send verification email if you change this</p>
								</div>

								<div>
									<Label htmlFor="organization">Organization (Optional)</Label>
									<Input id="organization" type="text" placeholder="Acme Inc." className="mt-2" />
								</div>

								<div className="flex justify-end">
									<Button type="submit" disabled={isSaving}>
										{isSaving ? "Saving..." : "Save Changes"}
									</Button>
								</div>
							</form>
						</div>
					)}

					{activeSection === "security" && (
						<div className="space-y-6">
							<div className="rounded-lg border bg-white p-6">
								<h2 className="mb-6 text-xl font-semibold text-gray-900">Change Password</h2>

								<form
									onSubmit={(e) => {
										e.preventDefault();
										handleSave("security");
									}}
									className="space-y-6"
								>
									<div>
										<Label htmlFor="current-password">Current Password</Label>
										<Input id="current-password" type="password" className="mt-2" />
									</div>

									<div>
										<Label htmlFor="new-password">New Password</Label>
										<Input id="new-password" type="password" className="mt-2" />
									</div>

									<div>
										<Label htmlFor="confirm-password">Confirm New Password</Label>
										<Input id="confirm-password" type="password" className="mt-2" />
									</div>

									<div className="flex justify-end">
										<Button type="submit" disabled={isSaving}>
											{isSaving ? "Updating..." : "Update Password"}
										</Button>
									</div>
								</form>
							</div>

							<div className="rounded-lg border bg-white p-6">
								<h2 className="mb-4 text-xl font-semibold text-gray-900">Two-Factor Authentication</h2>
								<p className="mb-4 text-sm text-gray-600">Add an extra layer of security to your account</p>
								<Button variant="outline" disabled>
									Enable 2FA (Coming Soon)
								</Button>
							</div>
						</div>
					)}

					{activeSection === "notifications" && (
						<div className="rounded-lg border bg-white p-6">
							<h2 className="mb-6 text-xl font-semibold text-gray-900">Email Preferences</h2>

							<form
								onSubmit={(e) => {
									e.preventDefault();
									handleSave("notifications");
								}}
								className="space-y-6"
							>
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="font-medium text-gray-900">Application Status Updates</p>
											<p className="text-sm text-gray-500">
												Get notified when your applications start, stop, or encounter errors
											</p>
										</div>
										<input
											type="checkbox"
											defaultChecked
											className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
										/>
									</div>

									<div className="flex items-center justify-between">
										<div>
											<p className="font-medium text-gray-900">Resource Alerts</p>
											<p className="text-sm text-gray-500">Receive alerts when resource usage exceeds thresholds</p>
										</div>
										<input
											type="checkbox"
											defaultChecked
											className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
										/>
									</div>

									<div className="flex items-center justify-between">
										<div>
											<p className="font-medium text-gray-900">Platform Updates</p>
											<p className="text-sm text-gray-500">Stay informed about new features and improvements</p>
										</div>
										<input
											type="checkbox"
											defaultChecked
											className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
										/>
									</div>

									<div className="flex items-center justify-between">
										<div>
											<p className="font-medium text-gray-900">Marketing Emails</p>
											<p className="text-sm text-gray-500">Occasional emails about Network Canvas products</p>
										</div>
										<input
											type="checkbox"
											className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
										/>
									</div>
								</div>

								<div className="flex justify-end">
									<Button type="submit" disabled={isSaving}>
										{isSaving ? "Saving..." : "Save Preferences"}
									</Button>
								</div>
							</form>
						</div>
					)}

					{activeSection === "billing" && (
						<div className="rounded-lg border bg-white p-6">
							<h2 className="mb-6 text-xl font-semibold text-gray-900">Billing Information</h2>
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<CreditCard className="mb-4 h-12 w-12 text-gray-400" />
								<h3 className="mb-2 text-lg font-semibold text-gray-900">Coming Soon</h3>
								<p className="text-sm text-gray-600">
									Billing and subscription management features will be available soon.
								</p>
							</div>
						</div>
					)}

					{activeSection === "api" && (
						<div className="rounded-lg border bg-white p-6">
							<h2 className="mb-6 text-xl font-semibold text-gray-900">API Keys</h2>
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<Key className="mb-4 h-12 w-12 text-gray-400" />
								<h3 className="mb-2 text-lg font-semibold text-gray-900">Coming Soon</h3>
								<p className="text-sm text-gray-600">API key management features will be available soon.</p>
							</div>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
