"use client";

import { Button, Checkbox, Label } from "@codaco/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { type Step4Data, Step4Schema } from "~/lib/wizard-types";

type Step4Props = {
	initialData?: Step4Data;
	onNext: (data: Step4Data) => void;
	onBack: () => void;
};

const TERMS_OF_SERVICE = `
# Terms of Service

Last updated: January 2025

## 1. Acceptance of Terms

By accessing and using the Fresco Platform, you accept and agree to be bound by the terms and provision of this agreement.

## 2. Use License

Permission is granted to temporarily deploy and use Fresco instances for personal, educational, or research purposes. This is the grant of a license, not a transfer of title.

## 3. Service Limitations

- Each user may deploy a limited number of instances based on their subscription tier
- Instances are subject to resource limitations and fair use policies
- We reserve the right to suspend or terminate instances that violate our policies

## 4. Data and Privacy

- You retain ownership of all data collected through your Fresco instances
- We collect minimal metadata for service operation and improvement
- Data is stored securely and not shared with third parties except as required by law

## 5. Acceptable Use

You agree not to:
- Use the service for any illegal purposes
- Attempt to gain unauthorized access to other users' instances
- Overload or interfere with service infrastructure
- Use the service to collect personal data without proper consent

## 6. Service Availability

- We strive for 99.9% uptime but do not guarantee uninterrupted service
- Scheduled maintenance will be announced in advance when possible
- We are not liable for data loss; regular backups are your responsibility

## 7. Termination

We may terminate or suspend access to our service immediately, without prior notice or liability, for any reason, including breach of these terms.

## 8. Changes to Terms

We reserve the right to modify or replace these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.

## 9. Contact Information

For questions about these terms, please contact: support@networkcanvas.com
`;

export function Step4Terms({ initialData, onNext, onBack }: Step4Props) {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<Step4Data>({
		resolver: zodResolver(Step4Schema),
		defaultValues: initialData,
	});

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6">
			<div className="space-y-2 text-center">
				<h2 className="text-3xl font-bold">Terms and Conditions</h2>
				<p className="text-muted-foreground">Please review and accept our terms to continue</p>
			</div>

			<form onSubmit={handleSubmit(onNext)} className="space-y-6">
				<div className="h-96 space-y-4 overflow-y-auto rounded-lg border bg-muted/30 p-6">
					<div className="prose prose-sm dark:prose-invert max-w-none">
						{TERMS_OF_SERVICE.split("\n\n").map((paragraph, index) => {
							if (paragraph.startsWith("#")) {
								const level = paragraph.match(/^#+/)?.[0].length ?? 1;
								const text = paragraph.replace(/^#+\s*/, "");
								const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
								return (
									<Tag key={index} className="font-bold">
										{text}
									</Tag>
								);
							}
							if (paragraph.startsWith("-")) {
								return (
									<ul key={index} className="list-disc space-y-1 pl-6">
										{paragraph
											.split("\n")
											.filter((line) => line.trim())
											.map((line, i) => (
												<li key={i}>{line.replace(/^-\s*/, "")}</li>
											))}
									</ul>
								);
							}
							return (
								<p key={index} className="text-sm">
									{paragraph}
								</p>
							);
						})}
					</div>
				</div>

				<div className="space-y-4 rounded-lg border bg-background p-4">
					<div className="flex items-start space-x-3">
						<Checkbox id="terms" {...register("agreedToTerms")} />
						<div className="flex-1">
							<Label htmlFor="terms" className="cursor-pointer font-medium">
								I have read and agree to the Terms of Service
							</Label>
							{errors.agreedToTerms && <p className="mt-1 text-sm text-destructive">{errors.agreedToTerms.message}</p>}
						</div>
					</div>

					<div className="flex items-start space-x-3">
						<Checkbox id="privacy" {...register("agreedToPrivacy")} />
						<div className="flex-1">
							<Label htmlFor="privacy" className="cursor-pointer font-medium">
								I have read and agree to the Privacy Policy
							</Label>
							{errors.agreedToPrivacy && (
								<p className="mt-1 text-sm text-destructive">{errors.agreedToPrivacy.message}</p>
							)}
						</div>
					</div>

					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<a
							href="/privacy"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 hover:text-foreground"
						>
							View Privacy Policy
							<ExternalLink className="h-3 w-3" />
						</a>
						<span>•</span>
						<a
							href="/sla"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 hover:text-foreground"
						>
							Service Level Agreement
							<ExternalLink className="h-3 w-3" />
						</a>
					</div>
				</div>

				<div className="flex gap-4">
					<Button type="button" variant="outline" onClick={onBack} className="flex-1">
						Back
					</Button>
					<Button type="submit" className="flex-1">
						Accept and Continue
					</Button>
				</div>
			</form>
		</div>
	);
}
