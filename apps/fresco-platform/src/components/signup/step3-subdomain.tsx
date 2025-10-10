"use client";

import { Button, Input } from "@codaco/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Globe, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { wizardApi } from "~/lib/wizard-api";
import { type Step3Data, Step3Schema } from "~/lib/wizard-types";

type Step3Props = {
	initialData?: Step3Data;
	onNext: (data: Step3Data) => void;
	onBack: () => void;
};

export function Step3Subdomain({ initialData, onNext, onBack }: Step3Props) {
	const [checking, setChecking] = useState(false);
	const [available, setAvailable] = useState<boolean | null>(null);
	const [suggestions, setSuggestions] = useState<string[]>([]);

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors },
	} = useForm<Step3Data>({
		resolver: zodResolver(Step3Schema),
		defaultValues: initialData,
	});

	const subdomain = watch("subdomain");

	useEffect(() => {
		const checkAvailability = async () => {
			if (!subdomain || subdomain.length < 3) {
				setAvailable(null);
				setSuggestions([]);
				return;
			}

			if (errors.subdomain) {
				setAvailable(null);
				setSuggestions([]);
				return;
			}

			setChecking(true);
			try {
				const result = await wizardApi.checkSubdomain(subdomain);
				setAvailable(result.available);
				setSuggestions(result.suggestions);
			} catch (_error) {
			} finally {
				setChecking(false);
			}
		};

		const timeoutId = setTimeout(checkAvailability, 500);
		return () => clearTimeout(timeoutId);
	}, [subdomain, errors.subdomain]);

	const fullUrl = subdomain ? `https://${subdomain}.fresco.networkcanvas.com` : "";

	return (
		<div className="mx-auto w-full max-w-md space-y-6">
			<div className="space-y-2 text-center">
				<h2 className="text-3xl font-bold">Choose Your Subdomain</h2>
				<p className="text-muted-foreground">This will be the URL for your Fresco instance</p>
			</div>

			<form onSubmit={handleSubmit(onNext)} className="space-y-6">
				<div className="space-y-4">
					<Input
						{...register("subdomain")}
						label="Subdomain"
						placeholder="my-study"
						error={errors.subdomain?.message}
						required
						rightAdornment={
							<div className="flex items-center">
								{checking && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
								{!checking && available === true && <Check className="h-5 w-5 text-green-500" />}
								{!checking && available === false && <X className="h-5 w-5 text-red-500" />}
							</div>
						}
					/>

					<div className="space-y-2 text-sm">
						<h4 className="font-medium">Format requirements:</h4>
						<ul className="list-inside list-disc space-y-1 text-muted-foreground">
							<li>3-63 characters long</li>
							<li>Lowercase letters, numbers, and hyphens only</li>
							<li>Must start and end with a letter or number</li>
							<li>No consecutive hyphens</li>
						</ul>
					</div>

					{subdomain && !errors.subdomain && (
						<div className="rounded-lg border bg-muted p-4">
							<div className="flex items-start gap-3">
								<Globe className="mt-0.5 h-5 w-5 text-muted-foreground" />
								<div className="flex-1">
									<p className="text-sm font-medium">Your instance will be available at:</p>
									<p className="mt-1 break-all font-mono text-sm text-primary">{fullUrl}</p>
								</div>
							</div>
						</div>
					)}

					{available === false && suggestions.length > 0 && (
						<div className="space-y-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950">
							<p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
								This subdomain is already taken. Try these alternatives:
							</p>
							<div className="flex flex-wrap gap-2">
								{suggestions.map((suggestion) => (
									<button
										key={suggestion}
										type="button"
										onClick={() => setValue("subdomain", suggestion)}
										className="rounded-md bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-900 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-100 dark:hover:bg-yellow-800"
									>
										{suggestion}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="flex gap-4">
					<Button type="button" variant="outline" onClick={onBack} className="flex-1">
						Back
					</Button>
					<Button type="submit" disabled={available !== true} className="flex-1">
						Continue
					</Button>
				</div>
			</form>
		</div>
	);
}
