"use client";

import { Button, Input, Label, RadioGroup, RadioGroupItem } from "@codaco/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { type Step2Data, Step2Schema, type UseCase } from "~/lib/wizard-types";

type Step2Props = {
	initialData?: Step2Data;
	onNext: (data: Step2Data) => void;
	onBack: () => void;
};

const USE_CASES: { value: UseCase; label: string; description: string }[] = [
	{
		value: "study",
		label: "Conducting a Study",
		description: "I'm planning to collect network data for research purposes",
	},
	{
		value: "testing",
		label: "Testing Features",
		description: "I want to explore and test the platform capabilities",
	},
	{
		value: "learning",
		label: "Learning the Platform",
		description: "I'm learning how to use Network Canvas and Fresco",
	},
	{
		value: "other",
		label: "Other",
		description: "My use case is different from the above",
	},
];

export function Step2UseCase({ initialData, onNext, onBack }: Step2Props) {
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors },
	} = useForm<Step2Data>({
		resolver: zodResolver(Step2Schema),
		defaultValues: initialData,
	});

	const selectedUseCase = watch("useCase");
	const shouldShowSandboxSuggestion = selectedUseCase === "testing" || selectedUseCase === "learning";

	return (
		<div className="mx-auto w-full max-w-md space-y-6">
			<div className="space-y-2 text-center">
				<h2 className="text-3xl font-bold">What brings you here?</h2>
				<p className="text-muted-foreground">Help us understand your intended use case</p>
			</div>

			<form onSubmit={handleSubmit(onNext)} className="space-y-6">
				<div className="space-y-4">
					<Label>Select your primary use case</Label>
					<RadioGroup
						value={selectedUseCase}
						onValueChange={(value) => setValue("useCase", value as UseCase)}
						className="space-y-3"
					>
						{USE_CASES.map((useCase) => (
							<div key={useCase.value} className="flex items-start space-x-3">
								<RadioGroupItem value={useCase.value} id={useCase.value} className="mt-1" />
								<div className="flex-1">
									<Label htmlFor={useCase.value} className="cursor-pointer font-medium">
										{useCase.label}
									</Label>
									<p className="text-sm text-muted-foreground">{useCase.description}</p>
								</div>
							</div>
						))}
					</RadioGroup>
					{errors.useCase && <p className="text-sm text-destructive">{errors.useCase.message}</p>}
				</div>

				{selectedUseCase === "other" && (
					<Input
						{...register("useCaseOther")}
						label="Please describe your use case"
						placeholder="Tell us more about how you plan to use Fresco"
						error={errors.useCaseOther?.message}
					/>
				)}

				{shouldShowSandboxSuggestion && (
					<div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
						<AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
						<div className="flex-1 space-y-2">
							<h4 className="font-semibold text-blue-900 dark:text-blue-100">Consider using our Sandbox</h4>
							<p className="text-sm text-blue-800 dark:text-blue-200">
								For testing and learning, we recommend using our free Fresco Sandbox. It's immediately available and
								doesn't require deployment.
							</p>
							<a
								href="https://fresco-sandbox.networkcanvas.com"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
							>
								Try the Sandbox
								<ExternalLink className="h-4 w-4" />
							</a>
						</div>
					</div>
				)}

				<div className="flex gap-4">
					<Button type="button" variant="outline" onClick={onBack} className="flex-1">
						Back
					</Button>
					<Button type="submit" className="flex-1">
						Continue
					</Button>
				</div>
			</form>
		</div>
	);
}
