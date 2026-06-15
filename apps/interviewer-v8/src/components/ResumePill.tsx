import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useLocation } from 'wouter';

import { updateSettings } from '~/lib/db/api';
import type { StoredSessionLite } from '~/lib/db/types';

// Enter: drops in from above as a circle, then the content panel
// springs open to reveal text + play button. The 0.7s delay on the drop
// lets the protocols screen settle first; the 1.4s delay on the width
// adds a deliberate pause between the two phases.
//
// Springs use a damping ratio of ~0.64 — one gentle overshoot, then
// settles. Lower stiffness keeps the motion soft rather than snappy.
//
// Exit: straight rise out the top. No content-panel exit variant, so
// the panel stays at its current width and the whole pill leaves intact.
const pillVariants = {
  hidden: { y: '-150%', opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      y: { type: 'spring', stiffness: 200, damping: 18, delay: 0.7 },
      opacity: { duration: 0.3, delay: 0.7 },
    },
  },
  exit: {
    y: '-150%',
    opacity: 0,
    transition: {
      y: { type: 'spring', stiffness: 380, damping: 30 },
      opacity: { duration: 0.25 },
    },
  },
} as const;

const contentPanelVariants = {
  hidden: { width: 0 },
  visible: {
    width: 'auto',
    transition: { type: 'spring', stiffness: 180, damping: 18, delay: 1.4 },
  },
} as const;

type ResumePillProps = {
  sessions: StoredSessionLite[];
};

// No inner AnimatePresence — the outer AnimatePresence in Home owns the
// presence tracking. If we nest one here, the motion.button's closest
// AnimatePresence becomes the inner one, which still reports
// `isPresent: true` while the outer is trying to exit. That swallowed
// the exit animation on view → data.
export function ResumePill({ sessions }: ResumePillProps) {
  const [, navigate] = useLocation();

  const inProgress = useMemo(() => {
    return sessions
      .filter((s) => s.finishedAt === null)
      .toSorted(
        (a, b) =>
          new Date(b.lastUpdatedAt).getTime() -
          new Date(a.lastUpdatedAt).getTime(),
      )[0];
  }, [sessions]);

  if (!inProgress) return null;

  const handleResume = async (sessionId: string) => {
    await updateSettings({ lastActiveSessionId: sessionId });
    navigate(`/interview/${sessionId}`);
  };

  return (
    <motion.button
      key="resume-pill-button"
      type="button"
      onClick={() => void handleResume(inProgress.id)}
      variants={pillVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="border-outline text-text bg-surface/50 effect-shadow-md pointer-events-auto relative inline-flex h-20 cursor-pointer items-center overflow-hidden rounded-full border backdrop-blur-md"
    >
      {/* Always-visible circle, sized to match the pill height so the
          collapsed state is a true circle. */}
      <div className="flex size-20 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="bg-sea-green animate-pulse-glow size-2 rounded-full shadow-[0_0_10px_oklch(var(--sea-green))]"
        />
      </div>

      {/* Content panel — width is the animated property. Spacing lives
          on margins on the children below, not as padding on the panel
          itself: `width: 0` with border-box padding would clamp up to
          the padding minimum and leave content peeking out. */}
      <motion.div
        variants={contentPanelVariants}
        className="flex h-full shrink-0 items-center gap-4 overflow-hidden"
      >
        <div className="ml-2 text-left whitespace-nowrap">
          <div className="font-heading text-text/60 mb-0.5 text-xs font-black tracking-widest uppercase">
            Resume last interview
          </div>
          <div className="font-heading max-w-xs overflow-hidden text-sm font-extrabold text-ellipsis">
            {inProgress.protocolName} – {inProgress.caseId || 'Untitled'}
          </div>
        </div>
        <div
          aria-hidden
          className="bg-sea-green text-primary-contrast mr-3.5 inline-flex size-14 shrink-0 items-center justify-center rounded-full"
        >
          <Play size={14} />
        </div>
      </motion.div>
    </motion.button>
  );
}
