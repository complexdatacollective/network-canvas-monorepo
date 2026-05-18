import { Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { useLocation } from 'wouter';

import { updateSettings } from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';

const EASE = [0.22, 1, 0.36, 1] as const;

type ResumePillProps = {
  sessions: StoredSession[];
};

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

  const handleResume = async (sessionId: string) => {
    await updateSettings({ lastActiveSessionId: sessionId });
    navigate(`/interview/${sessionId}`);
  };

  return (
    <AnimatePresence initial={false}>
      {inProgress ? (
        <motion.button
          key={`resume-${inProgress.id}`}
          type="button"
          onClick={() => void handleResume(inProgress.id)}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.55, delay: 0.45, ease: EASE }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="border-outline text-text inline-flex cursor-pointer items-center gap-4 self-center rounded-full border bg-[oklch(0.32_0.10_281/0.85)] py-3 pr-3.5 pl-[18px] shadow-md backdrop-blur-md"
        >
          <span
            aria-hidden
            className="bg-sea-green h-2 w-2 rounded-full shadow-[0_0_10px_oklch(var(--sea-green))]"
          />
          <div className="text-left">
            <div className="all-caps mb-0.5">
              Resume interview · {inProgress.caseId || 'Untitled'}
            </div>
            <div className="font-heading text-sm font-extrabold">
              {inProgress.protocolName}
            </div>
          </div>
          <div
            aria-hidden
            className="bg-sea-green text-primary-contrast inline-flex h-9 w-9 items-center justify-center rounded-full"
          >
            <Play size={14} />
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
