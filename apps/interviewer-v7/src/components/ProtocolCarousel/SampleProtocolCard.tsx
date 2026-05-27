import { Download, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import Button, { IconButton } from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { CARD_RADIUS_PX, cardBase, importCardClass } from './cardStyles';

type SampleProtocolCardProps = {
  isActive: boolean;
  onInstall: () => void;
  onDismiss: () => void;
};

export function SampleProtocolCard({
  isActive,
  onInstall,
  onDismiss,
}: SampleProtocolCardProps) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onInstall();
    }
  };

  return (
    // oxlint-disable-next-line prefer-tag-over-role
    // The card has nested Install + Dismiss buttons, so the outer element cannot be a <button>.
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onInstall}
      onKeyDown={onKeyDown}
      style={{
        boxShadow: 'var(--shadow-xl-base)',
        borderRadius: CARD_RADIUS_PX,
      }}
      className={`${cardBase()} ${importCardClass()} @container relative h-full w-full cursor-pointer justify-between!`}
      aria-label="Install the sample protocol"
    >
      {isActive ? (
        <IconButton
          variant="text"
          icon={
            <Trash2
              className="size-3 @min-[320px]:size-5 @min-3xs:size-4"
              aria-hidden
            />
          }
          aria-label="Dismiss the sample protocol"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="hover:bg-destructive! hover:text-destructive-contrast! absolute top-2 right-2 z-10 shrink-0"
        />
      ) : null}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-surface text-sea-green inline-flex h-[84px] w-[84px] items-center justify-center rounded-full">
          <Download size={36} strokeWidth={2.5} aria-hidden />
        </div>
        <Heading level="h2" margin="none" className="text-text font-black">
          Sample Protocol
        </Heading>
      </div>
      <div className="text-text/80 hidden px-8 text-center text-sm @min-[300px]:block">
        A complete reference protocol from the Network Canvas team — useful for
        exploring how stages, prompts, and codebooks fit together.
      </div>
      {isActive ? (
        <div className="w-full px-3 pb-3 @min-[320px]:px-5 @min-[320px]:pb-5 @min-[380px]:px-6 @min-[380px]:pb-6 @min-3xs:px-4 @min-3xs:pb-4">
          <Button
            color="primary"
            icon={
              <Download
                className="size-3 shrink-0 stroke-[3px]! @min-[240px]:size-4 @min-[300px]:size-5"
                aria-hidden
              />
            }
            className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-black tracking-[0.04em] uppercase @min-[240px]:gap-2 @min-[240px]:rounded-2xl @min-[240px]:px-4 @min-[240px]:py-2.5 @min-[240px]:tracking-[0.06em] @min-[300px]:gap-2.5 @min-[300px]:px-5 @min-[300px]:py-3 @min-[300px]:tracking-[0.07em] @min-[360px]:gap-3 @min-[360px]:px-6 @min-[360px]:tracking-[0.08em]"
            onClick={(e) => {
              e.stopPropagation();
              onInstall();
            }}
          >
            <span className="min-w-0 truncate text-[10px] @min-[240px]:text-xs @min-[300px]:text-sm @min-[360px]:text-base">
              Install sample protocol
            </span>
          </Button>
        </div>
      ) : null}
    </motion.div>
  );
}
