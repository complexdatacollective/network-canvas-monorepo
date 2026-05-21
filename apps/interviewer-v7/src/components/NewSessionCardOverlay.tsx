import { motion } from 'motion/react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { NewSessionForm } from './NewSessionForm';
import {
  CARD_RADIUS_PX,
  cardActiveShadow,
  deckCardHeadingLayoutId,
  deckCardLayoutId,
  deckCardMetaLayoutId,
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
          boxShadow: cardActiveShadow(palette.backgroundTop),
        }}
      >
        {/* Heading section — mirrors the in-slide DeckCard so the
            visual through the morph reads as the same card growing. */}
        <div className="relative flex w-full flex-col justify-between gap-4 overflow-hidden p-4 @min-2xs:p-6">
          <Pattern
            seed={protocol.name}
            className="absolute inset-0 size-full"
          />
          {/* EXPERIMENT — see DeckCard.tsx. Element type and class
              string must match its pair exactly, otherwise the layoutId
              morph re-introduces a jump. */}
          <motion.div
            layoutId={deckCardHeadingLayoutId(protocol.hash)}
            role="heading"
            aria-level={2}
            className="font-heading relative m-0 text-2xl leading-tight font-black"
          >
            {protocol.name}
          </motion.div>
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
