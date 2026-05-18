'use client';

import { createContext, useContext } from 'react';

// Return false to block navigation; returning true, undefined, or void allows navigation
export type BeforeNextHandler = () =>
  | Promise<boolean | undefined | void>
  | boolean
  | undefined
  | void;

export type WizardContextType = {
  currentStep: number;
  totalSteps: number;
  data: Record<string, unknown>;
  setStepData: (data: Record<string, unknown>) => void;
  setNextEnabled: (enabled: boolean) => void;
  setBackEnabled: (enabled: boolean) => void;
  setNextLabel: (label: string) => void;
  setBeforeNext: (handler: BeforeNextHandler | null) => void;
  goToStep: (step: number) => void;
};

export const WizardContext = createContext<WizardContextType | null>(null);

export function useWizard(): WizardContextType {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a wizard dialog');
  }
  return context;
}
