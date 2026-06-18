import { useCallback, useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { isCapacitor, isElectron } from '~/lib/platform/platform';
import { getStoreTarget } from '~/lib/update/storeUrls';
import type { UpdateInfo } from '~/lib/update/types';

const MARKDOWN_TAGS = [
  ...ALLOWED_MARKDOWN_SECTION_TAGS,
  'code',
  'pre',
  'blockquote',
];

export function UpdateNotes({ info }: { info: UpdateInfo }) {
  return (
    <div className="flex flex-col gap-4">
      <Paragraph>
        Please read the release notes below thoroughly before installing this
        update.
      </Paragraph>
      {/* Inset, recessed panel (own scroll container so the wheel scrolls the
          notes rather than the dialog). A raised surface level gives contrast
          against the dialog and feeds the inset-surface plugin's adaptive
          shadow via its background color. */}
      <div className="bg-surface-1 text-surface-1-contrast inset-surface max-h-[45vh] overflow-y-auto overscroll-contain rounded px-5 py-4">
        {info.releaseNotesMarkdown ? (
          <RenderMarkdown allowedElements={MARKDOWN_TAGS} unwrapDisallowed>
            {info.releaseNotesMarkdown}
          </RenderMarkdown>
        ) : (
          <Paragraph className="text-text/60">
            No release notes were provided for this version.
          </Paragraph>
        )}
      </div>
    </div>
  );
}

export function UpdateActions({
  info,
  onClose,
}: {
  info: UpdateInfo;
  onClose: () => void;
}) {
  if (isElectron) return <ElectronUpdateActions onClose={onClose} />;
  if (isCapacitor) return <CapacitorUpdateActions onClose={onClose} />;
  return <WebUpdateActions info={info} onClose={onClose} />;
}

type DownloadPhase = 'idle' | 'downloading' | 'downloaded' | 'error';

function ElectronUpdateActions({ onClose }: { onClose: () => void }) {
  const api = window.electronAPI?.update;
  const [phase, setPhase] = useState<DownloadPhase>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return undefined;
    const offProgress = api.onProgress((progress) => {
      setPhase('downloading');
      setPercent(progress.percent);
    });
    const offDownloaded = api.onDownloaded(() => setPhase('downloaded'));
    const offError = api.onError((message) => {
      setError(message);
      setPhase('error');
    });
    return () => {
      offProgress();
      offDownloaded();
      offError();
    };
  }, [api]);

  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
    setPhase('error');
  }, []);

  const startDownload = useCallback(() => {
    if (!api) return;
    setError(null);
    setPhase('downloading');
    // Download failures normally arrive via onError; this also catches a
    // rejection of the IPC call itself so the dialog never sticks on "downloading".
    api.download().catch(fail);
  }, [api, fail]);

  if (!api) return null;

  if (phase === 'downloading') {
    return (
      <div className="flex w-full flex-col gap-2">
        <ProgressBar orientation="horizontal" percentProgress={percent} />
        <Paragraph className="text-text/60 text-sm">
          Downloading update… {Math.round(percent)}%
        </Paragraph>
      </div>
    );
  }

  if (phase === 'downloaded') {
    return (
      <Button color="primary" onClick={() => api.install().catch(fail)}>
        Restart & install
      </Button>
    );
  }

  return (
    <>
      {error && (
        <Paragraph className="text-destructive w-full text-sm">
          {error}
        </Paragraph>
      )}
      <Button onClick={onClose}>Not now</Button>
      <Button color="primary" onClick={startDownload}>
        {phase === 'error' ? 'Try again' : 'Download & install'}
      </Button>
    </>
  );
}

function CapacitorUpdateActions({ onClose }: { onClose: () => void }) {
  const target = getStoreTarget();
  if (!target) return null;

  if (!target.available) {
    return (
      <>
        <Button onClick={onClose}>Close</Button>
        <Button color="primary" disabled>
          {target.label} (coming soon)
        </Button>
      </>
    );
  }

  return (
    <>
      <Button onClick={onClose}>Close</Button>
      <Button
        color="primary"
        onClick={() => {
          window.open(target.url, '_blank');
          onClose();
        }}
      >
        {target.label}
      </Button>
    </>
  );
}

function WebUpdateActions({
  info,
  onClose,
}: {
  info: UpdateInfo;
  onClose: () => void;
}) {
  return (
    <>
      <Button onClick={onClose}>Close</Button>
      <Button
        color="primary"
        onClick={() => {
          window.open(info.releaseUrl, '_blank', 'noopener,noreferrer');
          onClose();
        }}
      >
        View download page
      </Button>
    </>
  );
}
