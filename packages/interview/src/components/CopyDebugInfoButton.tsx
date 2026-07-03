'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';

// This button is rendered from StageErrorBoundary's fallback, which must
// keep working even when the app around it is broken. Historically this
// component confirmed the copy via useToast(), but that hook throws if
// there's no ancestor Toast.Provider — and not every host (e.g. the e2e
// test host, architect-web's PreviewHost) wires one up at the top level.
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

  return (
    <Button
      onClick={copyDebugInfoToClipboard}
      className={cx(className)}
      title="Copy to clipboard"
      color="primary"
      icon={copied ? <Check /> : <ClipboardCopy />}
    >
      {copied ? 'Copied!' : 'Copy Debug Info'}
    </Button>
  );
}
