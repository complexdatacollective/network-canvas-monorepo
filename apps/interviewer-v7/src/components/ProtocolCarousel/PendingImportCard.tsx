import { AnimatePresence, motion } from 'motion/react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { ImportPhase } from '~/lib/protocol/importProtocol';

import { CARD_RADIUS_PX, cardBase, protocolCardClass } from './cardStyles';

export type PendingImport = {
  id: string;
  label: string;
  source: 'file' | 'url' | 'sample';
  phase: ImportPhase;
  progress?: number;
};

type PendingImportCardProps = {
  pending: PendingImport;
};

const PHASE_LABEL: Record<ImportPhase, string> = {
  fetching: 'Fetching…',
  extracting: 'Extracting…',
  saving: 'Saving…',
};

export function PendingImportCard({ pending }: PendingImportCardProps) {
  const palette = seedToPatternPalette(pending.label);
  const phaseLabel = PHASE_LABEL[pending.phase];
  const progress = pending.progress;
  const determinate = typeof progress === 'number' && Number.isFinite(progress);
  const pct = determinate ? Math.min(1, Math.max(0, progress)) * 100 : 0;

  return (
    <motion.div
      style={{
        borderRadius: CARD_RADIUS_PX,
      }}
      className={`${cardBase()} ${protocolCardClass()} effect-shadow-xl @container h-full w-full`}
      aria-label={`Importing ${pending.label}`}
      aria-busy="true"
    >
      <div className="relative flex w-full flex-col justify-between gap-4 overflow-hidden p-4 @min-3xs:min-h-[40%] @min-2xs:p-6">
        <Pattern
          seed={pending.label}
          className="absolute inset-0 size-full opacity-60"
        />
        <Heading
          level="h2"
          margin="none"
          className="relative text-lg leading-tight font-black tracking-tighter text-balance @min-[320px]:text-2xl @min-[380px]:text-3xl @min-3xs:text-xl @min-2xs:mt-2"
        >
          {pending.label}
        </Heading>
        <div className="font-monospace relative hidden items-center justify-between gap-2 text-[12px] @min-3xs:flex @min-xs:text-xs @min-sm:text-sm">
          <AnimatePresence mode="wait">
            <motion.span
              key={pending.phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              style={{ color: palette.backgroundTop }}
            >
              {phaseLabel}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 pt-2 @min-2xs:px-6 @min-2xs:pt-3.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={pending.phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-text/80 text-xs @min-2xs:text-sm @min-xs:text-base @min-md:text-lg"
          >
            {phaseLabel}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="mx-3 mb-3 @min-[320px]:mx-5 @min-[320px]:mb-5 @min-[380px]:mx-6 @min-[380px]:mb-6 @min-3xs:mx-4 @min-3xs:mb-4">
        <progress
          className="sr-only"
          max={100}
          value={determinate ? Math.round(pct) : undefined}
          aria-label={`Importing ${pending.label}: ${phaseLabel}`}
        />
        <div
          className="bg-surface-2 relative h-2 w-full overflow-hidden rounded-full"
          aria-hidden="true"
        >
          {determinate ? (
            <div
              className="bg-sea-green h-full transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="bg-sea-green/70 absolute inset-y-0 left-0 h-full w-1/3 animate-[shimmer_1.2s_linear_infinite]" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
