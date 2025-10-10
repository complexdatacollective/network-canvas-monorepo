import { z } from "zod";

export const UseCaseEnum = z.enum(["study", "testing", "learning", "other"]);
export type UseCase = z.infer<typeof UseCaseEnum>;

export const Step1Schema = z
	.object({
		email: z.string().email("Please enter a valid email address"),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
			.regex(/[a-z]/, "Password must contain at least one lowercase letter")
			.regex(/[0-9]/, "Password must contain at least one number"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export const Step2Schema = z.object({
	useCase: UseCaseEnum,
	useCaseOther: z.string().optional(),
});

export const Step3Schema = z.object({
	subdomain: z
		.string()
		.min(3, "Subdomain must be at least 3 characters")
		.max(63, "Subdomain must be less than 63 characters")
		.regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Subdomain must contain only lowercase letters, numbers, and hyphens"),
});

export const Step4Schema = z.object({
	agreedToTerms: z.boolean().refine((val) => val === true, {
		message: "You must agree to the terms and conditions",
	}),
	agreedToPrivacy: z.boolean().refine((val) => val === true, {
		message: "You must agree to the privacy policy",
	}),
});

export type Step1Data = z.infer<typeof Step1Schema>;
export type Step2Data = z.infer<typeof Step2Schema>;
export type Step3Data = z.infer<typeof Step3Schema>;
export type Step4Data = z.infer<typeof Step4Schema>;

export type WizardData = {
	step1?: Step1Data;
	step2?: Step2Data;
	step3?: Step3Data;
	step4?: Step4Data;
};

export type DeploymentStatus = "idle" | "provisioning" | "success" | "error";

export interface WizardState {
	currentStep: number;
	sessionId: string | null;
	data: WizardData;
	deploymentStatus: DeploymentStatus;
	deploymentError: string | null;
	tenantId: string | null;
	subdomain: string | null;
	setCurrentStep: (step: number) => void;
	setSessionId: (sessionId: string) => void;
	updateStepData: <K extends keyof WizardData>(step: K, data: WizardData[K]) => void;
	setDeploymentStatus: (status: DeploymentStatus, error?: string) => void;
	setDeploymentResult: (tenantId: string, subdomain: string) => void;
	reset: () => void;
}
