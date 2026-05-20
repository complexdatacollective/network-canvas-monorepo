import { motion } from 'motion/react';
import { Link } from 'wouter';

const EASE = [0.22, 1, 0.36, 1] as const;
const APP_VERSION = '7.0.0';

type StatusRowProps = {
  protocolCount: number;
  interviewCount: number;
};

export function StatusRow({ protocolCount, interviewCount }: StatusRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 1.2, ease: EASE }}
      className="font-monospace text-text/60 flex items-center justify-between text-xs"
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
