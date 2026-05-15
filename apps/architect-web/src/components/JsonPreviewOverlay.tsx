import { useCallback, useState } from 'react';

import { useJsonPreview } from '~/hooks/useJsonPreview';

export function JsonPreviewOverlay() {
  const { isOpen, context, close } = useJsonPreview();
  const [copied, setCopied] = useState(false);

  const jsonString = context ? JSON.stringify(context.data, null, 2) : '';

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [jsonString]);

  if (!isOpen || !context) return null;

  return (
    <div className="fixed inset-0 z-(--z-modal) flex flex-col bg-black/95">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={close}
        aria-label="Close preview"
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-(--space-lg) py-(--space-md)">
          <span className="font-mono text-sm text-white/70">
            {context.label}
          </span>
          <div className="flex items-center gap-(--space-sm)">
            <span className="font-mono text-xs text-white/40">
              Alt+Shift+J to close
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="cursor-pointer rounded bg-white/10 px-(--space-sm) py-(--space-xs) font-mono text-xs text-white/80 transition-colors hover:bg-white/20"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <pre className="m-0 flex-1 overflow-auto p-(--space-lg) font-mono text-sm whitespace-pre text-white/90 select-all">
          {jsonString}
        </pre>
      </div>
    </div>
  );
}
