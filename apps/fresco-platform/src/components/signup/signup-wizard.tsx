"use client";

import { useEffect, useState } from "react";
import { wizardApi } from "~/lib/wizard-api";
import { useWizardStore } from "~/lib/wizard-store";
import type { Step1Data, Step2Data, Step3Data, Step4Data } from "~/lib/wizard-types";
import { Step1AccountCreation } from "./step1-account-creation";
import { Step2UseCase } from "./step2-use-case";
import { Step3Subdomain } from "./step3-subdomain";
import { Step4Terms } from "./step4-terms";
import { Step5Deployment } from "./step5-deployment";
import { Step6Success } from "./step6-success";

const TOTAL_STEPS = 6;

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
	return (
		<div className="mb-8 flex justify-center">
			<div className="flex items-center gap-2">
				{Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
					<div key={step} className="flex items-center">
						<div
							className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
								step < currentStep
									? "bg-green-500 text-white"
									: step === currentStep
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground"
							}`}
						>
							{step < currentStep ? "✓" : step}
						</div>
						{step < totalSteps && (
							<div className={`h-0.5 w-12 transition-colors ${step < currentStep ? "bg-green-500" : "bg-muted"}`} />
						)}
					</div>
				))}
			</div>
		</div>
	);
}

export function SignupWizard() {
	const {
		currentStep,
		sessionId,
		data,
		tenantId,
		subdomain,
		setCurrentStep,
		setSessionId,
		updateStepData,
		setDeploymentStatus,
		setDeploymentResult,
	} = useWizardStore();

	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		const initializeSession = async () => {
			if (!data.step1?.email) {
				setIsInitialized(true);
				return;
			}

			try {
				if (!sessionId) {
					const response = await wizardApi.createSession(data.step1.email);
					setSessionId(response.sessionId);
				}
			} catch (_error) {
			} finally {
				setIsInitialized(true);
			}
		};

		initializeSession();
	}, []);

	const handleStep1Next = async (stepData: Step1Data) => {
		updateStepData("step1", stepData);

		if (!sessionId) {
			try {
				const response = await wizardApi.createSession(stepData.email);
				setSessionId(response.sessionId);
			} catch (_error) {
				console.error("Failed to create session", _error);
				return;
			}
		}

		setCurrentStep(2);
	};

	const handleStep2Next = async (stepData: Step2Data) => {
		updateStepData("step2", stepData);

		if (sessionId) {
			try {
				await wizardApi.updateSession(sessionId, 2, {
					useCase: stepData.useCase,
					useCaseOther: stepData.useCaseOther,
				});
			} catch (_error) {
				console.error("Failed to update session", _error);
				return;
			}
		}

		setCurrentStep(3);
	};

	const handleStep3Next = async (stepData: Step3Data) => {
		updateStepData("step3", stepData);

		if (sessionId) {
			try {
				await wizardApi.updateSession(sessionId, 3, {
					subdomain: stepData.subdomain,
				});
			} catch (_error) {
				console.error("Failed to update session", _error);
				return;
			}
		}

		setCurrentStep(4);
	};

	const handleStep4Next = async (stepData: Step4Data) => {
		updateStepData("step4", stepData);

		if (sessionId) {
			try {
				await wizardApi.updateSession(sessionId, 4, {
					agreedToTerms: stepData.agreedToTerms,
					agreedToPrivacy: stepData.agreedToPrivacy,
				});
			} catch (_error) {
				console.error("Failed to update session", _error);
				return;
			}
		}

		setCurrentStep(5);
		await initiateDeployment();
	};

	const initiateDeployment = async () => {
		if (!sessionId) {
			return;
		}

		setDeploymentStatus("provisioning");

		try {
			const result = await wizardApi.deployTenant(sessionId);
			setDeploymentResult(result.tenantId, result.subdomain);
		} catch (error) {
			setDeploymentStatus("error", error instanceof Error ? error.message : "Deployment failed");
		}
	};

	const handleDeploymentSuccess = () => {
		setCurrentStep(6);
	};

	const handleDeploymentRetry = () => {
		setDeploymentStatus("idle");
		initiateDeployment();
	};

	if (!isInitialized) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-center">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="mt-4 text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-12">
			<div className="container mx-auto px-4">
				{currentStep < 6 && <StepIndicator currentStep={currentStep} totalSteps={TOTAL_STEPS} />}

				{currentStep === 1 && <Step1AccountCreation initialData={data.step1} onNext={handleStep1Next} />}

				{currentStep === 2 && (
					<Step2UseCase initialData={data.step2} onNext={handleStep2Next} onBack={() => setCurrentStep(1)} />
				)}

				{currentStep === 3 && (
					<Step3Subdomain initialData={data.step3} onNext={handleStep3Next} onBack={() => setCurrentStep(2)} />
				)}

				{currentStep === 4 && (
					<Step4Terms initialData={data.step4} onNext={handleStep4Next} onBack={() => setCurrentStep(3)} />
				)}

				{currentStep === 5 && tenantId && subdomain && (
					<Step5Deployment
						tenantId={tenantId}
						subdomain={subdomain}
						onSuccess={handleDeploymentSuccess}
						onRetry={handleDeploymentRetry}
					/>
				)}

				{currentStep === 6 && subdomain && data.step1?.email && (
					<Step6Success subdomain={subdomain} email={data.step1.email} />
				)}
			</div>
		</div>
	);
}
