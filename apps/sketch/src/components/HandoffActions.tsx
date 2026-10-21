import { type ReactNode, useState } from 'react';

import { downloadNetcanvas } from '../handoff/netcanvas.ts';
import {
  type HandoffOutcome,
  openInArchitect,
} from '../handoff/openInArchitect.ts';
import type { JobResult } from '../shared/api.ts';
import { ctaButton, ghostButton, paperButton } from './buttonStyles.ts';
import {
  ArrowUpRightIcon,
  CheckIcon,
  DownloadIcon,
  InfoIcon,
} from './Icons.tsx';

type OpenState = 'idle' | 'opening' | HandoffOutcome;

type Props = {
  result: JobResult;
  // `page` sits on the dark page (Ready); `card` sits on a paper card (Compare).
  variant: 'page' | 'card';
};

type NoteProps = {
  tone: 'success' | 'warning' | 'info';
  onPaper: boolean;
  children: ReactNode;
};

const Note = ({ tone, onPaper, children }: NoteProps) => (
  <div
    className={`text-ink flex items-start gap-3.5 rounded-[18px] px-[18px] py-4 ${
      onPaper ? 'bg-paper-sunk' : 'bg-paper'
    }`}
  >
    <span
      className={`mt-0.5 flex-none ${tone === 'success' ? 'text-sea-green-deep' : tone === 'warning' ? 'text-tangerine' : 'text-slate-blue'}`}
    >
      {tone === 'success' ? <CheckIcon size={22} /> : <InfoIcon size={22} />}
    </span>
    <p className="m-0 text-[0.9375rem]">{children}</p>
  </div>
);

const FALLBACK =
  'Download the file instead and open it from Architect’s start screen.';

export const HandoffActions = ({ result, variant }: Props) => {
  const [openState, setOpenState] = useState<OpenState>('idle');
  const [architectError, setArchitectError] = useState('');
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const onPaper = variant === 'card';

  const open = async () => {
    setOpenState('opening');
    setArchitectError('');
    const outcome = await openInArchitect(
      {
        protocol: result.protocol,
        name: result.summary.name,
        assets: result.assets,
      },
      { onError: setArchitectError },
    );
    setOpenState(outcome);
  };

  const download = async () => {
    setDownloadFailed(false);
    try {
      setSavedAs(
        await downloadNetcanvas(
          result.protocol,
          result.assets,
          result.summary.name,
        ),
      );
    } catch {
      setDownloadFailed(true);
    }
  };

  const openLabel =
    openState === 'opening' ? 'Opening Architect…' : 'Open in Architect';

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5">
        <button
          type="button"
          onClick={() => void open()}
          disabled={openState === 'opening'}
          className={
            onPaper
              ? `${ctaButton} min-h-12 px-5 text-base shadow-none`
              : `${ctaButton} min-h-[60px] px-[30px] text-[1.1875rem]`
          }
        >
          {openLabel}
          <ArrowUpRightIcon size={onPaper ? 18 : 20} />
        </button>
        <button
          type="button"
          onClick={() => void download()}
          className={
            onPaper
              ? paperButton
              : `${ghostButton} min-h-[60px] border-[oklch(0.55_0.09_281)] px-6 text-base font-bold`
          }
        >
          <DownloadIcon size={18} />
          {onPaper ? 'Download' : 'Download .netcanvas'}
        </button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {openState === 'opening' && (
          <Note tone="info" onPaper={onPaper}>
            Waiting for Architect to open in a new tab…
          </Note>
        )}
        {openState === 'opened' && (
          <Note tone="success" onPaper={onPaper}>
            <strong>Architect opened in a new tab with your protocol.</strong>
          </Note>
        )}
        {openState === 'blocked' && (
          <Note tone="warning" onPaper={onPaper}>
            <strong>Your browser blocked the new tab.</strong> {FALLBACK}
          </Note>
        )}
        {openState === 'timeout' && (
          <Note tone="warning" onPaper={onPaper}>
            <strong>Architect did not answer.</strong> It may still be loading,
            or the tab was closed. {FALLBACK}
          </Note>
        )}
        {openState === 'error' && (
          <Note tone="warning" onPaper={onPaper}>
            <strong>Architect could not open this protocol.</strong>{' '}
            {architectError ? `${architectError} ` : ''}
            {FALLBACK}
          </Note>
        )}
        {savedAs && (
          <Note tone="success" onPaper={onPaper}>
            <strong>Saved {savedAs}.</strong> In Architect, choose Open a
            protocol and pick this file.
          </Note>
        )}
        {downloadFailed && (
          <Note tone="warning" onPaper={onPaper}>
            <strong>The file could not be saved.</strong> Please try again.
          </Note>
        )}
      </div>
    </div>
  );
};
