'use client';

import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';

const messages = defineMessages({
  copyFrescoRecoveryCodes: {
    id: 'fresco.RecoveryCodes.copyFrescoRecoveryCodes',
    defaultMessage: 'Fresco Recovery Codes',
    description:
      'First line (title) of the text file the researcher downloads with their two-factor recovery codes. Content written into a file, not interface text.',
  },
  copySaveTheseCodesInASafePlace: {
    id: 'fresco.RecoveryCodes.copySaveTheseCodesInASafePlace',
    defaultMessage: 'Save these codes in a safe place.',
    description:
      'Instruction line near the top of the downloaded text file of two-factor recovery codes. Content written into a file, not interface text.',
  },
  copyEachCodeCanOnlyBeUsedOnce: {
    id: 'fresco.RecoveryCodes.copyEachCodeCanOnlyBeUsedOnce',
    defaultMessage: 'Each code can only be used once.',
    description:
      'Second instruction line in the downloaded text file of two-factor recovery codes; each recovery code works for one sign-in only. Content written into a file.',
  },
  copyCopied: {
    id: 'fresco.RecoveryCodes.copyCopied',
    defaultMessage: 'Copied!',
    description:
      'Label the Copy to clipboard button shows for two seconds after the recovery codes were copied (state, past tense).',
  },
  copyCopyToClipboard: {
    id: 'fresco.RecoveryCodes.copyCopyToClipboard',
    defaultMessage: 'Copy to clipboard',
    description:
      'Button under the list of two-factor recovery codes; copies all the codes to the clipboard (verb).',
  },
  saveYourRecoveryCodes: {
    id: 'fresco.RecoveryCodes.saveYourRecoveryCodes',
    defaultMessage: 'Save your recovery codes',
    description:
      'Title of the warning alert above the list of two-factor recovery codes, shown when two-factor authentication is set up (imperative).',
  },
  saveTheseRecoveryCodesInASafe: {
    id: 'fresco.RecoveryCodes.saveTheseRecoveryCodesInASafe',
    defaultMessage:
      'Save these recovery codes in a safe place. Each code can only be used once. If you lose access to your authenticator app, you can use these codes to sign in.',
    description:
      'Body of the warning alert above the list of recovery codes. Recovery codes are backup two-factor codes used to sign in when the authenticator app is unavailable.',
  },
  downloadAsText: {
    id: 'fresco.RecoveryCodes.downloadAsText',
    defaultMessage: 'Download as text',
    description:
      'Button under the list of two-factor recovery codes; saves the codes as a plain text file (verb).',
  },
});

type RecoveryCodesProps = {
  codes: string[];
};

export default function RecoveryCodes({ codes }: RecoveryCodesProps) {
  const intl = useAppIntl();

  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const content = [
      intl.formatMessage(messages.copyFrescoRecoveryCodes),
      '=====================',
      '',
      intl.formatMessage(messages.copySaveTheseCodesInASafePlace),
      intl.formatMessage(messages.copyEachCodeCanOnlyBeUsedOnce),
      '',
      ...codes,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fresco-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        <AlertTitle>
          {intl.formatMessage(messages.saveYourRecoveryCodes)}
        </AlertTitle>
        <AlertDescription>
          {intl.formatMessage(messages.saveTheseRecoveryCodesInASafe)}
        </AlertDescription>
      </Alert>
      <div className="grid grid-cols-2 gap-2" data-testid="recovery-codes-list">
        {codes.map((code) => (
          <code
            key={code}
            className="bg-input font-monospace rounded px-3 py-2 text-center text-sm"
            data-testid="recovery-code"
          >
            {code}
          </code>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={handleDownload}>
          {intl.formatMessage(messages.downloadAsText)}
        </Button>
        <Button onClick={() => void handleCopy()}>
          {copied
            ? intl.formatMessage(messages.copyCopied)
            : intl.formatMessage(messages.copyCopyToClipboard)}
        </Button>
      </div>
    </div>
  );
}
