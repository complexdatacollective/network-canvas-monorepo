import { motion } from 'motion/react';
import { Link } from 'wouter';

import { APP_VERSION } from '~/lib/platform/appVersion';

type StatusRowProps = {
  protocolCount: number;
  interviewCount: number;
};

const variants = {
  hidden: { opacity: 0, y: '100%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
  // Tween instead of motion's default unbounded spring: a y: '100%' exit
  // with the default spring settled in ~1.5s, which made
  // `AnimatePresence mode="wait"` hold up the data view's enter.
  exit: {
    opacity: 0,
    y: '100%',
    transition: { duration: 0.25, ease: 'easeIn' },
  },
} as const;

export function StatusRow({ protocolCount, interviewCount }: StatusRowProps) {
  return (
    <motion.div
      variants={variants}
      className="font-monospace text-text/60 flex items-center justify-between px-11 pb-4 text-xs"
    >
      <Link
        href="/data"
        className="inline-flex cursor-pointer items-center gap-3.5 text-current no-underline"
      >
        <span>
          <strong className="text-text font-bold">{protocolCount}</strong>{' '}
          protocols
        </span>
        <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-current" />
        <span>
          <strong className="text-text font-bold">{interviewCount}</strong>{' '}
          interviews
        </span>
      </Link>
      <span>Interviewer {APP_VERSION}</span>
    </motion.div>
  );
}
