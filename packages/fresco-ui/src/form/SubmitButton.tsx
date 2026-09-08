'use client';

import { Loader2 } from 'lucide-react';
import type React from 'react';
import type { ComponentProps } from 'react';

import { MotionButton } from '../Button';
import useFormStore from './hooks/useFormStore';

type SubmitButtonProps = ComponentProps<typeof MotionButton> & {
  /**
   * Replaces the label for the duration of the submit ("Unlocking…"), for a
   * flow whose wait is long enough that naming it is worth the cost.
   *
   * That cost is real: relabelling changes the control's accessible NAME
   * mid-action, so anything that identifies the button by its name — every
   * `getByRole('button', { name })`, in Vitest and in Playwright alike — sees
   * the submit control VANISH the moment the submit starts. Do not opt in for
   * a form whose tests use the control's disappearance to mean "the submit
   * finished": that reading is only correct while the name is stable.
   */
  submittingText?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * By default the label does not change while the form is submitting —
 * busy-ness is carried by the spinner, the disabled state and `aria-busy`.
 *
 * This used to relabel to "Submitting…" unconditionally, which made "the Save
 * button is gone" ambiguous between "still saving" and "saved, and the dialog
 * closed". A test waiting on that condition was really only waiting for one
 * macrotask of Testing Library's post-`waitFor` drain, and read pre-save state
 * as soon as the async save needed one turn more than that — which is what a
 * loaded CI runner produces (see `CategoricalBinPrompts.test.tsx`).
 */
export default function SubmitButton({
  children,
  submittingText,
  ...props
}: SubmitButtonProps) {
  const isSubmitting = useFormStore((state) => state.isSubmitting);

  return (
    <MotionButton
      color="primary"
      type="submit"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
      icon={isSubmitting ? <Loader2 className="animate-spin" /> : undefined}
      {...props}
    >
      {isSubmitting && submittingText !== undefined ? submittingText : children}
    </MotionButton>
  );
}
