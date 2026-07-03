import { HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import { APP_VERSION } from '~/lib/appVersion';
import { useAuth } from '~/lib/auth/AuthContext';
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
} from '~/lib/storage';

type StatusRowProps = {
  protocolCount: number;
  interviewCount: number;
};

type Durability = { persisted: boolean; usage: number | null };

const variants = {
  hidden: { opacity: 0, y: '100%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
  exit: {
    opacity: 0,
    y: '100%',
    transition: { duration: 0.25, ease: 'easeIn' },
  },
} as const;

export function StatusRow({ protocolCount, interviewCount }: StatusRowProps) {
  const { mode } = useAuth();
  const [durability, setDurability] = useState<Durability | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void Promise.all([isStoragePersisted(), estimateStorage()]).then(
        ([persisted, estimate]) => {
          if (active) setDurability({ persisted, usage: estimate.usage });
        },
      );
    };

    refresh();

    // requestPersistentStorage() in main.tsx is fire-and-forget and can
    // resolve after this component has already mounted and read a stale
    // (unpersisted) result. Re-check whenever the tab regains focus/visibility
    // so a grant that lands late clears the "Storage not persistent" warning.
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

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
      <div className="flex items-center gap-3.5">
        {/* Two orthogonal facts, stated separately so neither can be read as
            the other: encryption comes from the enrolled vault mode; storage
            durability (browser eviction) deliberately avoids security words
            and iconography. */}
        {mode ? (
          mode === 'none' ? (
            <span
              className="text-warning inline-flex items-center gap-1.5"
              title="No app security is enrolled — data is stored unencrypted. Enrol a PIN, passphrase, or biometric in Settings to encrypt it."
            >
              <ShieldAlert className="size-3.5" />
              Not encrypted
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5"
              title="Interview data is encrypted at rest with your enrolled unlock method."
            >
              <ShieldCheck className="size-3.5" />
              Encrypted
            </span>
          )
        ) : null}
        {durability ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={
              durability.usage !== null
                ? `${formatBytes(durability.usage)} stored`
                : undefined
            }
          >
            {durability.persisted ? (
              <>
                <HardDrive className="size-3.5" />
                Storage persistent
              </>
            ) : (
              <span className="text-warning inline-flex items-center gap-1.5">
                <HardDrive className="size-3.5" />
                Storage not persistent
              </span>
            )}
          </span>
        ) : null}
        <span>Interviewer {APP_VERSION}</span>
      </div>
    </motion.div>
  );
}
