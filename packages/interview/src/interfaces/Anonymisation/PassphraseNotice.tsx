'use client';

import { useEffect } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Spinner from '@codaco/fresco-ui/Spinner';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import { usePassphrase } from './usePassphrase';

export type PassphraseNoticeStatus = 'locked' | 'pending';

/**
 * Stands in for controls that read or save encrypted values while those values
 * cannot be used yet: no passphrase, or decryption under way. A locked notice
 * tells the participant to enter the passphrase, so it also brings up the
 * prompter they enter it in.
 */
export default function PassphraseNotice({
  status,
  className,
}: {
  status: PassphraseNoticeStatus;
  className?: string;
}) {
  const intl = useAppIntl();
  const { requirePassphrase } = usePassphrase();

  useEffect(() => {
    if (status === 'locked') requirePassphrase();
  }, [status, requirePassphrase]);

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
        <AppMessage message={runtimeMessages.protectedAnswersLocked} />
      )}
    </output>
  );
}
