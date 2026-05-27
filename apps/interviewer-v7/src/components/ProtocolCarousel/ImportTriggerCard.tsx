import { Plus } from 'lucide-react';

import Heading from '@codaco/fresco-ui/typography/Heading';

import { CARD_RADIUS_PX, cardBase, importCardClass } from './cardStyles';

type ImportTriggerCardProps = {
  onActivate: () => void;
};

export function ImportTriggerCard({ onActivate }: ImportTriggerCardProps) {
  return (
    <button
      type="button"
      onClick={onActivate}
      // Match the protocol card's shadow so the visual footprint
      // (and therefore perceived size) is identical.
      style={{
        boxShadow: 'var(--shadow-xl-base)',
        borderRadius: CARD_RADIUS_PX,
      }}
      className={`${cardBase()} ${importCardClass()} @container h-full w-full`}
      aria-label="Import a protocol"
    >
      <div className="bg-surface text-sea-green inline-flex h-[84px] w-[84px] items-center justify-center rounded-full">
        <Plus size={36} strokeWidth={2.5} aria-hidden />
      </div>
      <Heading level="h2" margin="none" className="text-text font-black">
        Import a protocol
      </Heading>
      <div className="px-8 text-center text-sm">
        Add a <span className="font-monospace text-text">.netcanvas</span> file
      </div>
    </button>
  );
}
