import { motion } from 'motion/react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { NewSessionForm } from './NewSessionForm';
import { CARD_RADIUS_PX } from './ProtocolCarousel/cardStyles';
import {
  deckCardHeadingLayoutId,
  deckCardLayoutId,
  deckCardMetaLayoutId,
  MotionHeading,
} from './ProtocolCarousel/DeckCard';

type NewSessionCardOverlayProps = {
  protocol: ProtocolWithCounts;
  sessionCount: number;
  onCancel: () => void;
  onCreated: (session: StoredSession) => void;
};

export function NewSessionCardOverlay({
  protocol,
  sessionCount,
  onCancel,
  onCreated,
}: NewSessionCardOverlayProps) {
  const palette = seedToPatternPalette(protocol.name);

  return (
    // Full-viewport wrapper centers the card via flexbox. `pointer-events:
    // none` lets clicks outside the card fall through to Home's backdrop
    // (which handles cancel); the card itself opts back in.
    <div className="pointer-events-none fixed inset-0 z-60 flex items-center justify-center">
      <motion.div
        // Paired with the in-slide DeckCard's motion.div via this
        // layoutId. Motion measures both rects automatically and
        // animates the morph in both directions (mount → grow to
        // centre, unmount → tuck back into the slide).
        layoutId={deckCardLayoutId(protocol.hash)}
        className="bg-surface-1 text-text @container pointer-events-auto flex w-md flex-col overflow-hidden"
        style={{
          borderRadius: CARD_RADIUS_PX,
          boxShadow: `var(--effect-shadow-2xl), 0 0 0 2px ${palette.backgroundTop}`,
        }}
      >
        {/* Heading section — mirrors the in-slide DeckCard so the
            visual through the morph reads as the same card growing. */}
        <div className="relative flex w-full flex-col justify-between gap-4 overflow-hidden p-4 @min-2xs:p-6">
          <Pattern
            seed={protocol.name}
            className="absolute inset-0 size-full"
          />
          {/* Must mirror DeckCard.tsx exactly — see comment there for
              why this is `layout="position"`. Responsive sizes on the
              overlay's wider @container kick the heading up to text-3xl. */}
          <MotionHeading
            layout="position"
            layoutId={deckCardHeadingLayoutId(protocol.hash)}
            level="h2"
            margin="none"
            className="relative text-lg leading-tight font-black tracking-tighter text-balance @min-[320px]:text-2xl @min-[380px]:text-3xl @min-3xs:text-xl @min-2xs:mt-2"
          >
            {protocol.name}
          </MotionHeading>
          <motion.div
            layoutId={deckCardMetaLayoutId(protocol.hash)}
            className="font-monospace relative hidden items-center justify-between gap-2 text-[12px] @min-3xs:flex @min-xs:text-xs @min-sm:text-sm"
          >
            <span>
              Imported <TimeAgo date={protocol.importedAt} />
            </span>
            <span>
              {sessionCount} {sessionCount === 1 ? 'interview' : 'interviews'}
            </span>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <NewSessionForm
            protocol={protocol}
            onCancel={onCancel}
            onCreated={onCreated}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
