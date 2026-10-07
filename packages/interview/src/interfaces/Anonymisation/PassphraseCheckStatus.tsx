'use client';

import { AppMessage } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Spinner from '@codaco/fresco-ui/Spinner';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { runtimeMessages } from '../../i18n/runtimeMessages';

/**
 * Says, visibly and to assistive technology, that the passphrase in the
 * enclosing form is being checked. Deriving its key takes a few seconds on a
 * slow device. The live region is always rendered so that its content
 * changing is announced.
 */
export default function PassphraseCheckStatus({
  className,
}: {
  className?: string;
}) {
  const isSubmitting = useFormStore((state) => state.isSubmitting);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx('flex items-center gap-2', className)}
    >
      {isSubmitting && (
        <>
          <Spinner size="xs" />
          <span>
            <AppMessage message={runtimeMessages.checkingPassphrase} />
          </span>
        </>
      )}
    </div>
  );
}
