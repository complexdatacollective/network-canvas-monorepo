'use client';

import { Button } from '@codaco/ui';
import { CopyCheck } from 'lucide-react';
import { useState } from 'react';

const CodeCopyButton = ({
  code,
  className,
}: {
  code: string;
  className?: string;
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Reset state after 2 seconds
  };

  return (
    <Button
      size={'xs'}
      variant={'tableHeader'}
      className={className}
      onClick={() => copyToClipboard(code)}
    >
      <CopyCheck className="h-5 w-5" />
      {isCopied ? 'Copied!' : 'Copy'}
    </Button>
  );
};

export default CodeCopyButton;
