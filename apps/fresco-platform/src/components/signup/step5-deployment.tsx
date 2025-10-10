"use client";

import { Button, Progress } from "@codaco/ui";
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { wizardApi } from "~/lib/wizard-api";

type DeploymentStep = {
	id: string;
	label: string;
	status: "pending" | "in_progress" | "completed" | "error";
};

type Step5Props = {
	tenantId: string;
	subdomain: string;
	onSuccess: () => void;
	onRetry: () => void;
};

export function Step5Deployment({ tenantId, subdomain, onSuccess, onRetry }: Step5Props) {
	const [steps, setSteps] = useState<DeploymentStep[]>([
		{ id: "validate", label: "Validating configuration", status: "in_progress" },
		{ id: "database", label: "Creating database schema", status: "pending" },
		{ id: "container", label: "Provisioning container", status: "pending" },
		{ id: "network", label: "Configuring network", status: "pending" },
		{ id: "startup", label: "Starting services", status: "pending" },
		{ id: "verification", label: "Verifying deployment", status: "pending" },
	]);

	const [deploymentStatus, setDeploymentStatus] = useState<"deploying" | "success" | "error">("deploying");
	const [error, setError] = useState<string | null>(null);
	const [estimatedTime, setEstimatedTime] = useState(120);

	useEffect(() => {
		const timer = setInterval(() => {
			setEstimatedTime((prev) => Math.max(0, prev - 1));
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		let currentStepIndex = 0;
		const stepInterval = setInterval(() => {
			if (currentStepIndex < steps.length) {
				setSteps((prevSteps) => {
					const newSteps = [...prevSteps];
					const prevStep = newSteps[currentStepIndex - 1];
					const currentStep = newSteps[currentStepIndex];

					if (currentStepIndex > 0 && prevStep) {
						prevStep.status = "completed";
					}
					if (currentStepIndex < steps.length && currentStep) {
						currentStep.status = "in_progress";
					}
					return newSteps;
				});
				currentStepIndex++;
			} else {
				clearInterval(stepInterval);
				checkDeploymentStatus();
			}
		}, 2000);

		return () => clearInterval(stepInterval);
	}, []);

	const checkDeploymentStatus = async () => {
		try {
			const status = await wizardApi.getDeploymentStatus(tenantId);

			if (status.status === "ACTIVE") {
				setSteps((prevSteps) =>
					prevSteps.map((step) => ({
						...step,
						status: "completed",
					})),
				);
				setDeploymentStatus("success");
				setTimeout(onSuccess, 1500);
			} else if (status.status === "ERROR") {
				setSteps((prevSteps) => {
					const newSteps = [...prevSteps];
					const lastInProgress = newSteps.findIndex((s) => s.status === "in_progress");
					if (lastInProgress !== -1 && newSteps[lastInProgress]) {
						newSteps[lastInProgress].status = "error";
					}
					return newSteps;
				});
				setDeploymentStatus("error");
				setError(status.error ?? "An unknown error occurred during deployment");
			} else {
				setTimeout(checkDeploymentStatus, 3000);
			}
		} catch (_err) {
			setDeploymentStatus("error");
			setError("Failed to check deployment status");
		}
	};

	const progress = (steps.filter((s) => s.status === "completed").length / steps.length) * 100;

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6">
			<div className="space-y-2 text-center">
				<h2 className="text-3xl font-bold">
					{deploymentStatus === "deploying" && "Deploying Your Instance"}
					{deploymentStatus === "success" && "Deployment Successful!"}
					{deploymentStatus === "error" && "Deployment Failed"}
				</h2>
				<p className="text-muted-foreground">
					{deploymentStatus === "deploying" && "Please wait while we set up your Fresco instance"}
					{deploymentStatus === "success" && "Your Fresco instance is ready to use"}
					{deploymentStatus === "error" && "We encountered an issue during deployment"}
				</p>
			</div>

			<div className="space-y-6">
				<div className="space-y-3">
					<div className="flex items-center justify-between text-sm">
						<span className="font-medium">Overall Progress</span>
						<span className="text-muted-foreground">{Math.round(progress)}%</span>
					</div>
					<Progress value={progress} className="h-3" />
					{deploymentStatus === "deploying" && estimatedTime > 0 && (
						<p className="text-center text-sm text-muted-foreground">
							Estimated time remaining: {formatTime(estimatedTime)}
						</p>
					)}
				</div>

				<div className="space-y-3 rounded-lg border bg-muted/30 p-6">
					{steps.map((step) => (
						<div key={step.id} className="flex items-center gap-3">
							<div className="flex-shrink-0">
								{step.status === "pending" && (
									<div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
								)}
								{step.status === "in_progress" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
								{step.status === "completed" && <CheckCircle className="h-5 w-5 text-green-500" />}
								{step.status === "error" && <AlertCircle className="h-5 w-5 text-red-500" />}
							</div>
							<span
								className={`flex-1 ${
									step.status === "completed"
										? "text-foreground"
										: step.status === "error"
											? "text-red-500"
											: step.status === "in_progress"
												? "font-medium text-foreground"
												: "text-muted-foreground"
								}`}
							>
								{step.label}
							</span>
						</div>
					))}
				</div>

				{deploymentStatus === "error" && error && (
					<div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
						<AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
						<div className="flex-1 space-y-2">
							<h4 className="font-semibold text-red-900 dark:text-red-100">Deployment Error</h4>
							<p className="text-sm text-red-800 dark:text-red-200">{error}</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={onRetry}
								className="mt-2 border-red-300 dark:border-red-700"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								Retry Deployment
							</Button>
						</div>
					</div>
				)}

				<div className="rounded-lg border bg-background p-4">
					<div className="flex items-start gap-3">
						<div className="flex-1">
							<p className="text-sm font-medium">Deploying to:</p>
							<p className="mt-1 break-all font-mono text-sm text-primary">
								https://{subdomain}.fresco.networkcanvas.com
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
