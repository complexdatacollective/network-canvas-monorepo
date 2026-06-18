import { useCallback, useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
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

export function UpdateToastActions({
  info,
  onView,
  onSkip,
  onDismiss,
}: {
  info: UpdateInfo;
  onView: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span>Version {info.version} is available.</span>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" color="primary" onClick={onView}>
          View details
        </Button>
        <Button size="sm" onClick={onSkip}>
          Skip this release
        </Button>
        <Button size="sm" variant="text" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function UpdateNotes({ info }: { info: UpdateInfo }) {
  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="pr-4">
        {info.releaseNotesMarkdown ? (
          <RenderMarkdown
            allowedElements={MARKDOWN_TAGS}
            unwrapDisallowed={true}
          >
            {info.releaseNotesMarkdown}
          </RenderMarkdown>
        ) : (
          <Paragraph className="text-text/60">
            No release notes were provided for this version.
          </Paragraph>
        )}
      </div>
    </ScrollArea>
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

  const startDownload = useCallback(() => {
    if (!api) return;
    setError(null);
    setPhase('downloading');
    void api.download();
  }, [api]);

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
      <Button color="primary" onClick={() => void api.install()}>
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
