"use client";

import { Button, Input, Label } from "@codaco/ui";
import { Book, CheckCircle, ExternalLink, HelpCircle, MessageSquare } from "lucide-react";
import { useState } from "react";

type FAQItem = {
	question: string;
	answer: string;
};

const faqs: FAQItem[] = [
	{
		question: "How do I start my Fresco instance?",
		answer:
			"Navigate to the Applications page, find your instance, and click the 'Start' button. Your instance will be running within a few seconds.",
	},
	{
		question: "What are the resource limits for each instance?",
		answer:
			"Each instance has 512MB of memory and 0.5 CPU cores allocated by default. These limits ensure fair resource distribution across all users.",
	},
	{
		question: "Can I use a custom domain for my instance?",
		answer:
			"Custom domain support is coming soon. Currently, all instances are accessible via their subdomain at *.example.com.",
	},
	{
		question: "How do I export data from my instance?",
		answer:
			"You can export data directly from the Fresco interface. Navigate to your instance, go to the Data Export section, and follow the instructions.",
	},
	{
		question: "What happens if I destroy an instance?",
		answer:
			"Destroying an instance permanently deletes all data and configurations. This action cannot be undone. Make sure to export any data you need before destroying an instance.",
	},
	{
		question: "How can I monitor resource usage?",
		answer:
			"Go to the Application Details page for any instance to see real-time metrics including CPU usage, memory consumption, and network traffic.",
	},
];

export default function SupportPage() {
	const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
	const [contactForm, setContactForm] = useState({
		subject: "",
		message: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		await new Promise((resolve) => setTimeout(resolve, 1500));

		setIsSubmitting(false);
		setSubmitted(true);
		setContactForm({ subject: "", message: "" });

		setTimeout(() => setSubmitted(false), 5000);
	};

	return (
		<div className="mx-auto max-w-7xl">
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-gray-900">Support</h1>
				<p className="mt-1 text-sm text-gray-500">Get help and find resources</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="rounded-lg border bg-white p-6 transition-shadow hover:shadow-md">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
						<Book className="h-6 w-6 text-blue-600" />
					</div>
					<h3 className="mb-2 text-lg font-semibold text-gray-900">Documentation</h3>
					<p className="mb-4 text-sm text-gray-600">Comprehensive guides and API references for the Fresco Platform</p>
					<Button variant="outline" asChild className="w-full">
						<a href="https://documentation.networkcanvas.com" target="_blank" rel="noopener noreferrer">
							View Docs
							<ExternalLink className="ml-2 h-4 w-4" />
						</a>
					</Button>
				</div>

				<div className="rounded-lg border bg-white p-6 transition-shadow hover:shadow-md">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
						<MessageSquare className="h-6 w-6 text-green-600" />
					</div>
					<h3 className="mb-2 text-lg font-semibold text-gray-900">Community Forum</h3>
					<p className="mb-4 text-sm text-gray-600">Connect with other users and the Network Canvas team</p>
					<Button variant="outline" asChild className="w-full">
						<a href="https://community.networkcanvas.com" target="_blank" rel="noopener noreferrer">
							Join Forum
							<ExternalLink className="ml-2 h-4 w-4" />
						</a>
					</Button>
				</div>

				<div className="rounded-lg border bg-white p-6 transition-shadow hover:shadow-md">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
						<HelpCircle className="h-6 w-6 text-purple-600" />
					</div>
					<h3 className="mb-2 text-lg font-semibold text-gray-900">GitHub Issues</h3>
					<p className="mb-4 text-sm text-gray-600">Report bugs and request features on our GitHub repository</p>
					<Button variant="outline" asChild className="w-full">
						<a href="https://github.com/complexdatacollective/network-canvas" target="_blank" rel="noopener noreferrer">
							View GitHub
							<ExternalLink className="ml-2 h-4 w-4" />
						</a>
					</Button>
				</div>
			</div>

			<div className="mt-8 rounded-lg border bg-white p-6">
				<h2 className="mb-2 text-xl font-semibold text-gray-900">System Status</h2>
				<p className="mb-6 text-sm text-gray-600">Current operational status of the Fresco Platform</p>

				<div className="space-y-4">
					<div className="flex items-center justify-between rounded-lg bg-green-50 p-4">
						<div className="flex items-center gap-3">
							<CheckCircle className="h-5 w-5 text-green-600" />
							<div>
								<p className="font-medium text-green-900">All Systems Operational</p>
								<p className="text-sm text-green-700">All services are running normally</p>
							</div>
						</div>
						<span className="text-sm text-green-700">Last updated: Just now</span>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="rounded-lg border p-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<span className="font-medium text-gray-900">API Services</span>
							</div>
							<p className="mt-1 text-sm text-gray-600">Operational</p>
						</div>

						<div className="rounded-lg border p-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<span className="font-medium text-gray-900">Container Orchestration</span>
							</div>
							<p className="mt-1 text-sm text-gray-600">Operational</p>
						</div>

						<div className="rounded-lg border p-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<span className="font-medium text-gray-900">Database Services</span>
							</div>
							<p className="mt-1 text-sm text-gray-600">Operational</p>
						</div>

						<div className="rounded-lg border p-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<span className="font-medium text-gray-900">Network Infrastructure</span>
							</div>
							<p className="mt-1 text-sm text-gray-600">Operational</p>
						</div>
					</div>
				</div>
			</div>

			<div className="mt-8 rounded-lg border bg-white p-6">
				<h2 className="mb-6 text-xl font-semibold text-gray-900">Frequently Asked Questions</h2>

				<div className="space-y-4">
					{faqs.map((faq, index) => (
						<div key={index} className="rounded-lg border">
							<button
								type="button"
								onClick={() => setExpandedFAQ(expandedFAQ === index ? null : index)}
								className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50"
							>
								<span className="font-medium text-gray-900">{faq.question}</span>
								<span className="text-gray-400">{expandedFAQ === index ? "−" : "+"}</span>
							</button>
							{expandedFAQ === index && (
								<div className="border-t bg-gray-50 p-4">
									<p className="text-sm text-gray-600">{faq.answer}</p>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			<div className="mt-8 rounded-lg border bg-white p-6">
				<h2 className="mb-2 text-xl font-semibold text-gray-900">Contact Support</h2>
				<p className="mb-6 text-sm text-gray-600">
					Can't find what you're looking for? Send us a message and we'll get back to you as soon as possible.
				</p>

				{submitted && (
					<div className="mb-6 flex items-center gap-3 rounded-lg bg-green-50 p-4">
						<CheckCircle className="h-5 w-5 text-green-600" />
						<div>
							<p className="font-medium text-green-900">Message sent successfully!</p>
							<p className="text-sm text-green-700">We'll respond to your inquiry within 24 hours.</p>
						</div>
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-6">
					<div>
						<Label htmlFor="subject">Subject</Label>
						<Input
							id="subject"
							type="text"
							value={contactForm.subject}
							onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
							placeholder="Brief description of your issue"
							required
							className="mt-2"
						/>
					</div>

					<div>
						<Label htmlFor="message">Message</Label>
						<textarea
							id="message"
							value={contactForm.message}
							onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
							placeholder="Provide detailed information about your question or issue"
							required
							rows={6}
							className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
						/>
					</div>

					<div className="flex justify-end">
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Sending..." : "Send Message"}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
