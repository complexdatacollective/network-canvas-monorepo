import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

import { Pattern, seedToPatternPalette } from '@codaco/art';

export function UnlockEmblem({
  icon: Icon,
  seed,
}: {
  icon: LucideIcon;
  seed: string;
}) {
  const palette = seedToPatternPalette(seed);

  return (
    <motion.div
      aria-hidden
      initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      className="relative grid size-24 place-items-center overflow-hidden rounded-full"
      style={{
        boxShadow: `0 0 0 3px ${palette.backgroundTop}, var(--effect-shadow-xl)`,
      }}
    >
      <Pattern seed={seed} className="absolute inset-0 size-full" />
      <Icon
        className="relative size-10 text-white drop-shadow-md"
        strokeWidth={2.4}
      />
    </motion.div>
  );
}
