'use client';

import { useEffect } from 'react';

import useFormStore from './hooks/useFormStore';

/**
 * Empties the enclosing form each time the dialog around it closes.
 *
 * A dialog has to stay mounted with `open={false}` for its exit animation to
 * run at all — the `AnimatePresence` that runs the exit lives inside it, so
 * unmounting the dialog takes the animation with it and the dialog vanishes
 * rather than closing. That leaves the form store, which sits OUTSIDE the
 * dialog so the footer's submit can reach it, holding whatever was last typed.
 *
 * Render this inside the `FormStoreProvider`, beside the dialog:
 *
 * ```tsx
 * <FormStoreProvider>
 *   <ResetFormWhenClosed open={open} />
 *   <Dialog open={open} footer={<SubmitButton form={formId} />}>…</Dialog>
 * </FormStoreProvider>
 * ```
 *
 * Reset on the CLOSE rather than on the next opening, deliberately: for a
 * passphrase or a PIN the point is that it stops existing as soon as the
 * researcher is done with it, not that it is gone by the time anyone looks
 * again.
 *
 * Do NOT reach for a `key` on the provider instead. Remounting it remounts the
 * dialog inside it, and a dialog remounted mid-exit leaves its portal behind:
 * measured on the interviewer's passphrase dialog, the field stayed in the
 * document, with its contents, for good.
 */
export default function ResetFormWhenClosed({ open }: { open: boolean }) {
  const resetForm = useFormStore((state) => state.resetForm);

  // Whenever it is closed, rather than only on the transition into closed: a
  // reset restores each field's own initial value, so running it on a form
  // that is already empty changes nothing, and the transition guard it
  // replaces was a branch no test could tell apart.
  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  return null;
}
