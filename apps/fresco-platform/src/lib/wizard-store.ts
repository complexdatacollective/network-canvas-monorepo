import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WizardState } from "./wizard-types";

export const useWizardStore = create<WizardState>()(
	persist(
		(set) => ({
			currentStep: 1,
			sessionId: null,
			data: {},
			deploymentStatus: "idle",
			deploymentError: null,
			tenantId: null,
			subdomain: null,

			setCurrentStep: (step) => set({ currentStep: step }),

			setSessionId: (sessionId) => set({ sessionId }),

			updateStepData: (step, stepData) =>
				set((state) => ({
					data: {
						...state.data,
						[step]: stepData,
					},
				})),

			setDeploymentStatus: (status, error) =>
				set({
					deploymentStatus: status,
					deploymentError: error ?? null,
				}),

			setDeploymentResult: (tenantId, subdomain) =>
				set({
					tenantId,
					subdomain,
					deploymentStatus: "success",
				}),

			reset: () =>
				set({
					currentStep: 1,
					sessionId: null,
					data: {},
					deploymentStatus: "idle",
					deploymentError: null,
					tenantId: null,
					subdomain: null,
				}),
		}),
		{
			name: "fresco-wizard-storage",
			partialize: (state) => ({
				sessionId: state.sessionId,
				data: state.data,
				currentStep: state.currentStep,
			}),
		},
	),
);
