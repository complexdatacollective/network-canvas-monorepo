'use client';

import { Button } from '@codaco/ui';
import { CopyCheck } from 'lucide-react';
import { useState } from 'react';
import { cn } from '~/lib/utils';

const CodeCopyButton = ({
  code,
  className,
}: {
  code: string;
  className?: string;
}) => {
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
      variant={'tableHeader'}
      className={cn('rounded-md bg-platinum p-2 text-navy-taupe', className)}
      onClick={() => copyToClipboard(code)}
    >
      <CopyCheck className="h-5 w-5" />
      {isCopied ? 'Copied!' : 'Copy'}
    </Button>
  );
};

export default CodeCopyButton;
