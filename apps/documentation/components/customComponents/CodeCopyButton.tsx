'use client';

import { Button } from '@codaco/ui';
import { CopyCheck } from 'lucide-react';
import { useState } from 'react';

const CodeCopyButton = ({ code }: { code: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset state after 2 seconds
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <Button
      size={'xs'}
      className="absolute right-2 top-2 flex gap-1.5"
      onClick={() => copyToClipboard(code)}
    >
      <CopyCheck className="h-5 w-5" />
      {isCopied ? 'Copied!' : 'Copy'}
    </Button>
  );
};

export default CodeCopyButton;
