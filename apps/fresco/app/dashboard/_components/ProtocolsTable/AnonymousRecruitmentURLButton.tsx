'use client';

import { Copy } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import { useToast } from '@codaco/fresco-ui/Toast';

const messages = defineMessages({
  copyCopyingURLToClipboard: {
    id: 'fresco.ProtocolsTable.AnonymousRecruitmentURLButton.copyCopyingURLToClipboard',
    defaultMessage: 'Copying URL to clipboard...',
    description:
      'Researcher-facing ProtocolsTable / AnonymousRecruitmentURLButton: Copying URL to clipboard...',
  },
  copyURLCopiedToClipboard: {
    id: 'fresco.ProtocolsTable.AnonymousRecruitmentURLButton.copyURLCopiedToClipboard',
    defaultMessage: 'URL copied to clipboard!',
    description:
      'Researcher-facing ProtocolsTable / AnonymousRecruitmentURLButton: URL copied to clipboard!',
  },
  failedToCopyURLToClipboard: {
    id: 'fresco.ProtocolsTable.AnonymousRecruitmentURLButton.failedToCopyURLToClipboard',
    defaultMessage: 'Failed to copy URL to clipboard.',
    description:
      'Researcher-facing ProtocolsTable / AnonymousRecruitmentURLButton: Failed to copy URL to clipboard.',
  },
});

export const AnonymousRecruitmentURLButton = ({
  protocolId,
}: {
  protocolId: string;
}) => {
  const { promise } = useToast();

  // The deployment's origin is only knowable in the browser, and the server
  // renders this button too, so the URL stays empty through the hydrating
  // render — matching the server's markup — and is derived from then on.
  const hasHydrated = useHasHydrated();
  const url = hasHydrated
    ? `${window.location.origin}/onboard/${protocolId}`
    : null;

  const handleCopyClick = () => {
    if (!url) {
      return;
    }

    void promise(navigator.clipboard.writeText(url), {
      loading: {
        description: (
          <AppMessage message={messages.copyCopyingURLToClipboard} />
        ),
      },
      success: {
        description: <AppMessage message={messages.copyURLCopiedToClipboard} />,
      },
      error: {
        description: (
          <AppMessage message={messages.failedToCopyURLToClipboard} />
        ),
      },
    });
  };

  return (
    <Button size="sm" onClick={handleCopyClick} color="primary">
      <Copy className="mr-2 size-4" />
      <span className="w-36 truncate">{url}</span>
    </Button>
  );
};
