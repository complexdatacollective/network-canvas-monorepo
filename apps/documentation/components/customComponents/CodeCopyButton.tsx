'use client';

import { ClipboardCheck, ClipboardCopy } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';

const CodeCopyButton = ({ code }: { code: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (_error) {}
  };

  return (
    <div className="absolute top-2 right-2 flex items-center gap-2">
      {/* Always-present live region so the "Copied!" result is announced; it
          also renders the visible confirmation bubble when copied. */}
      <span
        role="status"
        aria-live="polite"
        className={
          isCopied
            ? 'bg-surface-popover text-surface-popover-contrast rounded-md p-1.5 text-sm font-semibold'
            : 'sr-only'
        }
      >
        {isCopied ? 'Copied!' : ''}
      </span>
      <IconButton
        aria-label="Copy code"
        color="primary"
        icon={
          isCopied ? (
            <ClipboardCheck className="h-4 w-4" />
          ) : (
            <ClipboardCopy className="h-4 w-4" />
          )
        }
        className={
          isCopied
            ? undefined
            : 'transition-opacity sm:opacity-0 sm:group-hover:opacity-100'
        }
        onClick={() => copyToClipboard(code)}
      />
    </div>
  );
};

export default CodeCopyButton;
