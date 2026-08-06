'use client';

import { Loader2 } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '../Button';
import Pips from '../Pips';
import type { GetFieldValue, WizardDialog } from './DialogProvider';
import {
  type BeforeNextHandler,
  WizardContext,
  type WizardContextType,
} from './useWizard';

type UseWizardStateArgs = {
  dialog: WizardDialog;
  dialogId: string;
  closeDialog: (id: string, value: unknown) => Promise<void>;
  getFieldValue: GetFieldValue;
  validateForm: () => Promise<boolean>;
  getFieldErrors: () => Record<string, string[] | undefined>;
  getFormValues: () => Record<string, unknown>;
};

type WizardDialogProps = {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  footer: ReactNode;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Merge one step's field values over the accumulator. Plain objects merge
// recursively so nested paths registered by DIFFERENT steps under one
// top-level key (e.g. `user.firstName` then `user.lastName`) keep their
// siblings; arrays and primitives REPLACE, so a revisited step whose
// repeated-entry answer shrank (e.g. a count-driven list) doesn't leave
// orphaned entries behind.
//
// Deliberately NOT pruned: a key whose field no longer renders (a FieldGroup
// condition flipped, or its whole step is now skipped) keeps its accumulated
// answer in the wizard payload. That preserves the wizard's long-standing
// contract — consumers gate on the controlling flag (e.g. reading
// `partner.*` only when `hasPartner` is true) — and pruning here could not
// be done reliably anyway: a dynamically skipped step never refolds, so
// tracking per-step contributed paths would only ever catch the
// revisited-step case while silently keeping the skipped-step one.
const mergeStepValues = (
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? mergeStepValues(existing, value)
        : value;
  }
  return result;
};

export default function useWizardState({
  dialog,
  dialogId,
  closeDialog,
  getFieldValue,
  validateForm,
  getFieldErrors,
  getFormValues,
}: UseWizardStateArgs): WizardDialogProps | null {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [completedStepValues, setCompletedStepValues] = useState<
    Record<number, Record<string, unknown>>
  >({});
  const [nextEnabled, setNextEnabled] = useState(true);
  const [backEnabled, setBackEnabled] = useState(true);
  const [nextLabelOverride, setNextLabelOverride] = useState<string | null>(
    null,
  );
  const [isNextLoading, setIsNextLoading] = useState(false);

  const beforeNextRef = useRef<BeforeNextHandler | null>(null);
  const prevStepRef = useRef(stepIndex);
  const dataRef = useRef(data);
  dataRef.current = data;

  const currentStep = dialog.steps[stepIndex];
  const totalSteps = dialog.steps.length;

  const findNextUnskipped = useCallback(
    (from: number, dir: 'forward' | 'backward'): number | null => {
      const delta = dir === 'forward' ? 1 : -1;
      let candidate = from + delta;
      while (candidate >= 0 && candidate < totalSteps) {
        const step = dialog.steps[candidate];
        if (!step?.skip?.({ data: dataRef.current, getFieldValue }))
          return candidate;
        candidate += delta;
      }
      return null;
    },
    [dialog.steps, totalSteps, getFieldValue],
  );

  const isFirstActive = findNextUnskipped(stepIndex, 'backward') === null;
  const isLastActive = findNextUnskipped(stepIndex, 'forward') === null;

  const showProgress =
    dialog.progress !== undefined ? dialog.progress !== null : true;

  const activeStepCount = useMemo(() => {
    if (!showProgress) return 0;
    return dialog.steps.filter((s) => !s.skip?.({ data, getFieldValue }))
      .length;
  }, [dialog.steps, data, getFieldValue, showProgress]);

  const activeStepIndex = useMemo(() => {
    if (!showProgress) return 0;
    let idx = 0;
    for (let i = 0; i < stepIndex; i++) {
      if (!dialog.steps[i]?.skip?.({ data, getFieldValue })) idx++;
    }
    return idx;
  }, [dialog.steps, data, stepIndex, getFieldValue, showProgress]);

  const resetStepOverrides = useCallback(() => {
    setNextEnabled(true);
    setBackEnabled(true);
    setNextLabelOverride(null);
    beforeNextRef.current = null;
  }, []);

  const goToStep = useCallback(
    (target: number) => {
      if (target < 0 || target >= totalSteps) return;
      if (target <= stepIndex) {
        setCompletedStepValues((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(
              ([completedIndex]) => Number(completedIndex) < target,
            ),
          ),
        );
      }

      // The current step's fields are about to unmount (the FormStoreProvider
      // is shared across all steps, but only the active step's fields are
      // registered). Fold their values into the accumulator before that
      // happens — otherwise they'd only live on in dormant storage, which no
      // longer feeds getFormValues(). The setData update MUST be functional:
      // a beforeNext handler may have staged data via setStepData in this
      // same tick, and a non-functional replacement computed from the ref
      // would clobber that queued update. The ref is merged eagerly too so
      // same-tick readers stay consistent; the next render re-syncs it from
      // the authoritative state.
      const stepValues = getFormValues();
      dataRef.current = mergeStepValues(dataRef.current, stepValues);
      setData((prev) => mergeStepValues(prev, stepValues));
      prevStepRef.current = stepIndex;
      resetStepOverrides();
      setStepIndex(target);
      requestAnimationFrame(() => {
        document
          .querySelector('[role="dialog"] .scroll-area-viewport')
          ?.scrollTo(0, 0);
      });
    },
    [stepIndex, totalSteps, resetStepOverrides, getFormValues],
  );

  const handleNext = useCallback(async () => {
    setIsNextLoading(true);
    try {
      // Validate all currently registered form fields
      const isFormValid = await validateForm();
      if (!isFormValid) {
        const fieldErrors = getFieldErrors();
        const firstErrorField = Object.keys(fieldErrors)[0];
        if (firstErrorField) {
          const el = document.querySelector(
            `[data-field-name="${CSS.escape(firstErrorField)}"]`,
          );
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // Run step-specific beforeNext handler if registered
      const handler = beforeNextRef.current;
      if (handler) {
        const shouldProceed = await handler();
        if (shouldProceed === false) return;
      }
    } catch {
      return;
    } finally {
      setIsNextLoading(false);
    }

    const next = findNextUnskipped(stepIndex, 'forward');
    if (next === null) {
      // dataRef is kept fresh by setStepData's eager merge, so data staged by
      // a beforeNext handler in this same tick is included here.
      const formValues = mergeStepValues(dataRef.current, getFormValues());
      const result = dialog.onFinish ? dialog.onFinish(formValues) : formValues;
      await closeDialog(dialogId, result);
      return;
    }

    setCompletedStepValues((previous) => ({
      ...previous,
      [stepIndex]: getFormValues(),
    }));
    goToStep(next);
  }, [
    dialog,
    closeDialog,
    dialogId,
    goToStep,
    stepIndex,
    findNextUnskipped,
    validateForm,
    getFieldErrors,
    getFormValues,
  ]);

  const handleBack = useCallback(() => {
    const prev = findNextUnskipped(stepIndex, 'backward');
    if (prev !== null) goToStep(prev);
  }, [goToStep, stepIndex, findNextUnskipped]);

  const handleCancel = useCallback(() => {
    void closeDialog(dialogId, null);
  }, [closeDialog, dialogId]);

  const setStepData = useCallback((stepData: Record<string, unknown>) => {
    // Eagerly reflect the patch in the ref so same-tick readers see it — a
    // beforeNext handler staging data immediately before goToStep folds or
    // the finish path resolves must not lose it to the not-yet-committed
    // state update. The next render re-syncs the ref from state.
    dataRef.current = { ...dataRef.current, ...stepData };
    setData((prev) => ({ ...prev, ...stepData }));
  }, []);

  const setBeforeNext = useCallback((handler: BeforeNextHandler | null) => {
    beforeNextRef.current = handler;
  }, []);

  const wizardContext = useMemo<WizardContextType>(
    () => ({
      currentStep: stepIndex,
      totalSteps,
      data,
      completedStepValues,
      setStepData,
      setNextEnabled,
      setBackEnabled: (enabled: boolean) => setBackEnabled(enabled),
      setNextLabel: (label: string) => setNextLabelOverride(label),
      setBeforeNext,
      goToStep,
    }),
    [
      stepIndex,
      totalSteps,
      data,
      completedStepValues,
      setStepData,
      setBeforeNext,
      goToStep,
    ],
  );

  if (!currentStep) return null;

  const ProgressComponent = dialog.progress;
  const StepContent = currentStep.content;

  const nextLabel =
    nextLabelOverride ??
    currentStep.nextLabel ??
    (isLastActive ? 'Finish' : 'Continue');

  const showBackButton = !isFirstActive;

  return {
    title: currentStep.title,
    description: currentStep.description,
    children: (
      <WizardContext.Provider value={wizardContext}>
        <StepContent />
      </WizardContext.Provider>
    ),
    footer: (
      <div className="flex grow flex-col gap-4">
        {ProgressComponent ? (
          <div className="flex flex-1 justify-center">
            <ProgressComponent
              currentStep={activeStepIndex}
              totalSteps={activeStepCount}
            />
          </div>
        ) : (
          showProgress &&
          activeStepCount > 1 && (
            <div className="flex flex-1 justify-center">
              <Pips
                count={activeStepCount}
                currentIndex={activeStepIndex}
                small
              />
            </div>
          )
        )}
        <div className="phone-landscape:flex-row phone-landscape:justify-between flex flex-col gap-8">
          <Button onClick={handleCancel} data-testid="wizard-cancel">
            {dialog.cancelLabel ?? 'Cancel'}
          </Button>

          <div className="phone-landscape:flex-row phone-landscape:justify-between flex flex-col gap-2">
            {showBackButton && (
              <Button
                onClick={handleBack}
                disabled={isFirstActive || !backEnabled}
                data-testid="wizard-back"
              >
                {currentStep.backLabel ?? 'Back'}
              </Button>
            )}
            <Button
              color="primary"
              onClick={() => void handleNext()}
              disabled={!nextEnabled || isNextLoading}
              data-testid="wizard-next"
            >
              {isNextLoading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                nextLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    ),
  };
}
