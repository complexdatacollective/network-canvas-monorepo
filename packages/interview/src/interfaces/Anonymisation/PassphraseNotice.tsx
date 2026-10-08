'use client';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Spinner from '@codaco/fresco-ui/Spinner';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { runtimeMessages } from '../../i18n/runtimeMessages';

export type PassphraseNoticeStatus = 'locked' | 'pending' | 'failed';

/**
 * Stands in for controls that read or save encrypted values while those values
 * cannot be used yet: no passphrase, decryption under way, or decryption
 * failed.
 */
export default function PassphraseNotice({
  status,
  className,
}: {
  status: PassphraseNoticeStatus;
  className?: string;
}) {
  const intl = useAppIntl();

  return (
    <output
      className={cx(
        'flex flex-col items-center justify-center p-6 text-center',
        className,
      )}
    >
      {status === 'pending' ? (
        <>
          <Spinner size="sm" />
          <span className="sr-only">
            {intl.formatMessage(commonMessages.loading)}
          </span>
        </>
      ) : (
        <AppMessage
          message={
            status === 'failed'
              ? runtimeMessages.decryptRetry
              : runtimeMessages.protectedAnswersLocked
          }
        />
      )}
    </output>
  );
}
