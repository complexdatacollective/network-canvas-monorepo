import { Upload } from 'lucide-react';
import type { DragEvent } from 'react';
import { useState } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { ExternalLink } from '../ExternalLink';
import { CARD_RADIUS_PX, cardBase } from './cardStyles';

type ImportTriggerCardProps = {
  // Carousel activation (click / Enter on the active card): opens the file
  // picker. On a non-active card the carousel intercepts this to navigate.
  onActivate: () => void;
  // A file dropped onto the card.
  onImportFile: (file: File) => void;
};

// The always-last card in the deck. The card itself is the import surface —
// click it to open the file picker, or drop a `.netcanvas` file onto it. The
// frosted-glass look (backdrop-blur) is applied by DeckCarousel's slide
// wrapper, not here: backdrop-filter doesn't propagate through the card's own
// transform, so the (separately transformed) wrapper reads the blob backdrop.
export function ImportTriggerCard({
  onActivate,
  onImportFile,
}: ImportTriggerCardProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onImportFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      // dragenter/dragleave also fire when crossing descendant boundaries, so
      // only clear the highlight once the pointer actually leaves the card.
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
      // Match the protocol card's radius so the visual footprint (and
      // therefore perceived size) is identical.
      style={{ borderRadius: CARD_RADIUS_PX }}
      className={cx(
        'text-text/80 effect-shadow-xl @container relative h-full w-full border-[3px] border-dashed transition-colors duration-180',
        dragOver
          ? 'border-sea-green bg-[color-mix(in_oklab,oklch(var(--sea-green))_20%,var(--surface))]'
          : 'border-outline bg-surface/50',
      )}
    >
      {/* The button fills the whole card so a click anywhere on it — not just
          the centred content — opens the picker. The note below overlays the
          bottom with pointer-events disabled so its (non-link) area falls
          through to the button too, keeping the entire surface clickable. */}
      <button
        type="button"
        onClick={onActivate}
        aria-label="Import a protocol"
        className={cx(
          cardBase(),
          'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[inherit] px-8 pb-12 text-center',
        )}
      >
        <span
          aria-hidden
          className="bg-surface text-sea-green inline-flex h-[84px] w-[84px] items-center justify-center rounded-full"
        >
          <Upload size={36} strokeWidth={2.5} aria-hidden />
        </span>
        <Heading level="h2" margin="none" className="text-text font-black">
          Import a protocol
        </Heading>
        <span className="text-sm">
          Drop a <span className="font-monospace text-text">.netcanvas</span>{' '}
          file, or click to browse
        </span>
      </button>
      <p className="text-text/70 pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-6 text-center text-xs">
        Protocols are authored in{' '}
        <span className="pointer-events-auto">
          <ExternalLink href="https://architect.networkcanvas.com">
            Architect
          </ExternalLink>
        </span>
        .
      </p>
    </div>
  );
}
