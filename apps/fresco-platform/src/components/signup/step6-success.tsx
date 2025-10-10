"use client";

import { Button } from "@codaco/ui";
import { BookOpen, CheckCircle, Copy, ExternalLink, FileText, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step6Props = {
	subdomain: string;
	email: string;
};

export function Step6Success({ subdomain, email }: Step6Props) {
	const router = useRouter();
	const [copiedUrl, setCopiedUrl] = useState(false);
	const [copiedEmail, setCopiedEmail] = useState(false);

	const instanceUrl = `https://${subdomain}.fresco.networkcanvas.com`;

	const copyToClipboard = async (text: string, type: "url" | "email") => {
		try {
			await navigator.clipboard.writeText(text);
			if (type === "url") {
				setCopiedUrl(true);
				setTimeout(() => setCopiedUrl(false), 2000);
			} else {
				setCopiedEmail(true);
				setTimeout(() => setCopiedEmail(false), 2000);
			}
		} catch (_err) {}
	};

	const quickStartSteps = [
		{
			icon: BookOpen,
			title: "Read the Documentation",
			description: "Learn about Fresco's features and best practices",
			link: "https://documentation.networkcanvas.com/en/fresco",
		},
		{
			icon: Video,
			title: "Watch Tutorial Videos",
			description: "Step-by-step guides to get you started quickly",
			link: "https://networkcanvas.com/tutorials",
		},
		{
			icon: FileText,
			title: "Create Your First Protocol",
			description: "Use Architect to design your data collection protocol",
			link: "https://documentation.networkcanvas.com/en/architect",
		},
	];

	return (
		<div className="mx-auto w-full max-w-2xl space-y-8">
			<div className="space-y-4 text-center">
				<div className="flex justify-center">
					<div className="rounded-full bg-green-100 p-4 dark:bg-green-900">
						<CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
					</div>
				</div>
				<h2 className="text-3xl font-bold">Your Instance is Ready!</h2>
				<p className="text-muted-foreground">Congratulations! Your Fresco instance has been successfully deployed.</p>
			</div>

			<div className="space-y-4 rounded-lg border bg-muted/30 p-6">
				<h3 className="font-semibold">Access Your Instance</h3>
				<div className="space-y-3">
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground">Instance URL</label>
						<div className="flex gap-2">
							<div className="flex-1 rounded-md border bg-background px-3 py-2">
								<code className="text-sm">{instanceUrl}</code>
							</div>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={() => copyToClipboard(instanceUrl, "url")}
								title="Copy URL"
							>
								{copiedUrl ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground">Account Email</label>
						<div className="flex gap-2">
							<div className="flex-1 rounded-md border bg-background px-3 py-2">
								<code className="text-sm">{email}</code>
							</div>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={() => copyToClipboard(email, "email")}
								title="Copy email"
							>
								{copiedEmail ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
							</Button>
						</div>
					</div>
				</div>

				<div className="mt-4 rounded-md bg-blue-50 p-3 dark:bg-blue-950">
					<p className="text-sm text-blue-900 dark:text-blue-100">
						A verification email has been sent to <strong>{email}</strong>. Please verify your email to access all
						features.
					</p>
				</div>
			</div>

			<div className="space-y-4">
				<h3 className="font-semibold">Quick Start Guide</h3>
				<div className="grid gap-4 md:grid-cols-3">
					{quickStartSteps.map((step, index) => (
						<a
							key={index}
							href={step.link}
							target="_blank"
							rel="noopener noreferrer"
							className="flex flex-col gap-3 rounded-lg border bg-background p-4 transition-colors hover:bg-muted"
						>
							<div className="flex items-center gap-3">
								<div className="rounded-full bg-primary/10 p-2">
									<step.icon className="h-5 w-5 text-primary" />
								</div>
								<ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
							</div>
							<div>
								<h4 className="font-medium">{step.title}</h4>
								<p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
							</div>
						</a>
					))}
				</div>
			</div>

			<div className="space-y-4 rounded-lg border bg-background p-6">
				<h3 className="font-semibold">What's Next?</h3>
				<ul className="space-y-2 text-sm text-muted-foreground">
					<li className="flex gap-2">
						<span className="text-primary">•</span>
						<span>
							<strong>Verify your email</strong> to unlock all features and ensure you receive important updates
						</span>
					</li>
					<li className="flex gap-2">
						<span className="text-primary">•</span>
						<span>
							<strong>Create protocols</strong> using the Architect application to define your data collection workflow
						</span>
					</li>
					<li className="flex gap-2">
						<span className="text-primary">•</span>
						<span>
							<strong>Upload your protocols</strong> to your Fresco instance to make them available for interviews
						</span>
					</li>
					<li className="flex gap-2">
						<span className="text-primary">•</span>
						<span>
							<strong>Manage your instance</strong> from the dashboard to monitor usage and configure settings
						</span>
					</li>
				</ul>
			</div>

			<div className="flex gap-4">
				<Button type="button" variant="outline" onClick={() => window.open(instanceUrl, "_blank")} className="flex-1">
					<ExternalLink className="mr-2 h-4 w-4" />
					Open Instance
				</Button>
				<Button type="button" onClick={() => router.push("/dashboard")} className="flex-1">
					Go to Dashboard
				</Button>
			</div>
		</div>
	);
}
