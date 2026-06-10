import { motion } from 'motion/react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
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
  open: boolean;
  protocol: ProtocolWithCounts;
  sessionCount: number;
  onCancel: () => void;
  onCreated: (session: StoredSession) => void;
};

export function NewSessionCardOverlay({
  open,
  protocol,
  sessionCount,
  onCancel,
  onCreated,
}: NewSessionCardOverlayProps) {
  const palette = seedToPatternPalette(protocol.name);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <ModalPopup
        layoutId={deckCardLayoutId(protocol.hash)}
        className="bg-surface-1 text-text @container fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-var(--spacing-base)*10)] w-md max-w-[calc(100vw-var(--spacing-base)*8)] -translate-1/2 flex-col overflow-hidden"
        style={{
          borderRadius: CARD_RADIUS_PX,
          boxShadow: `var(--effect-shadow-2xl), 0 0 0 2px ${palette.backgroundTop}`,
        }}
      >
        <div className="relative flex w-full flex-col justify-between gap-4 overflow-hidden p-4 @min-2xs:p-6">
          <Pattern
            seed={protocol.name}
            className="absolute inset-0 size-full"
          />
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
      </ModalPopup>
    </Modal>
  );
}
