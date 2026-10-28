'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';

// This button is rendered from StageErrorBoundary's fallback, which must
// keep working even when the app around it is broken. Historically this
// component confirmed the copy via useToast(), but that hook throws if
// there's no ancestor Toast.Provider — and not every host (e.g. the e2e
// test host, architect's PreviewHost) wires one up at the top level.
// A confirmation local to this component has no such dependency, so the
// button is self-sufficient in any host.
const CONFIRMATION_DURATION_MS = 2000;

export default function CopyDebugInfoButton({
  debugInfo,
  className,
}: {
  debugInfo: string;
  className?: string;
}) {
  const intl = useAppIntl();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const copyDebugInfoToClipboard = async () => {
    await navigator.clipboard.writeText(debugInfo);

    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(
      () => setCopied(false),
      CONFIRMATION_DURATION_MS,
    );
  };

  // The label switches to "Copied" for sighted participants; the status
  // region says the same to a screen reader, which does not reliably
  // announce a change to the focused button's own text.
  return (
    <>
      <Button
        onClick={copyDebugInfoToClipboard}
        className={className}
        color="primary"
        icon={
          copied ? (
            <Check aria-hidden="true" />
          ) : (
            <ClipboardCopy aria-hidden="true" />
          )
        }
      >
        {intl.formatMessage(copied ? messages.copied : messages.copy)}
      </Button>
      <span role="status" className="sr-only">
        {copied ? intl.formatMessage(messages.copied) : null}
      </span>
    </>
  );
}
