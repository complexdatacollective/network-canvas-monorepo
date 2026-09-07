import { useCallback, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useJsonPreview } from '~/hooks/useJsonPreview';
const messages = defineMessages({
  closePreview: {
    id: 'architect.jsonPreviewOverlay.closePreview',
    defaultMessage: 'Close preview',
    description: 'The aria-label text in components / JsonPreviewOverlay.',
  },
  altShiftJToClose: {
    id: 'architect.jsonPreviewOverlay.altShiftJToClose',
    defaultMessage: 'Alt+Shift+J to close',
    description: 'Visible text in components / JsonPreviewOverlay.',
  },
  copied: {
    id: 'architect.jsonPreviewOverlay.copied',
    defaultMessage: 'Copied!',
    description: 'Visible text in components / JsonPreviewOverlay.',
  },
  copy: {
    id: 'architect.jsonPreviewOverlay.copy',
    defaultMessage: 'Copy',
    description: 'Visible text in components / JsonPreviewOverlay.',
  },
});

export function JsonPreviewOverlay() {
  const intl = useAppIntl();
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
    <div className="fixed inset-0 z-2000 flex flex-col bg-black/95">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={close}
        aria-label={intl.formatMessage(messages.closePreview)}
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-7 py-5">
          <span className="font-monospace text-sm text-white/70">
            {context.label}
          </span>
          <div className="flex items-center gap-2.5">
            <span className="font-monospace text-xs text-white/40">
              {intl.formatMessage(messages.altShiftJToClose)}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="font-monospace cursor-pointer rounded bg-white/10 px-2.5 py-1 text-xs text-white/80 transition-colors hover:bg-white/20"
            >
              {copied
                ? intl.formatMessage(messages.copied)
                : intl.formatMessage(messages.copy)}
            </button>
          </div>
        </div>
        <pre className="font-monospace m-0 flex-1 overflow-auto p-7 text-sm whitespace-pre text-white/90 select-all">
          {jsonString}
        </pre>
      </div>
    </div>
  );
}
