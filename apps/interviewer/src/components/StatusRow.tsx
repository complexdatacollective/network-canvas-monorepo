import { HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { APP_VERSION } from '~/lib/appVersion';
import type { AuthMode } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';
import { isRunningInstalled } from '~/lib/pwa/isRunningInstalled';
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
  STORAGE_PERSISTED_EVENT,
} from '~/lib/storage';

import AppUpdatePill from './AppUpdate/AppUpdatePill';

type Durability = { persisted: boolean; usage: number | null };

// Read the current durability. Persistence is *requested* elsewhere (main.tsx at
// startup and on install; the auth enrol path when encryption is enabled) — this
// only reflects the resulting grant, re-reading on the events that follow one.
async function readDurability(): Promise<Durability> {
  const [persisted, estimate] = await Promise.all([
    isStoragePersisted(),
    estimateStorage(),
  ]);
  return { persisted, usage: estimate.usage };
}

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

// Pure presentation: the dashboard's bottom-of-screen footer strip. `mode`
// mirrors useAuth's enrolled security mode; `durability` mirrors the
// storage-persistence poll (null until the first check resolves).
export function StatusRowView({
  protocolCount,
  interviewCount,
  mode,
  durability,
  installed,
  versionSlot = <span>Interviewer {APP_VERSION}</span>,
}: {
  protocolCount: number;
  interviewCount: number;
  mode: AuthMode | undefined;
  durability: Durability | null;
  installed: boolean;
  versionSlot?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={variants}
      className="font-monospace text-text/60 tablet-landscape:px-11 flex items-center justify-between px-6 pb-4 text-xs"
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
      <div className="flex items-center gap-6">
        {/* Two orthogonal facts, stated separately so neither can be read as
            the other: encryption comes from the enrolled vault mode; storage
            durability (browser eviction) deliberately avoids security words
            and iconography. */}
        {mode ? (
          mode === 'none' ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    className="focusable text-warning inline-flex items-center gap-1.5 rounded-sm"
                  >
                    <ShieldAlert className="size-3.5" />
                    Not encrypted
                  </span>
                }
              />
              <TooltipContent>
                No app security is enrolled — data is stored unencrypted. Enrol
                a PIN, passphrase, or biometric in Settings to encrypt it.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    className="focusable inline-flex items-center gap-1.5 rounded-sm"
                  >
                    <ShieldCheck className="size-3.5" />
                    Encrypted
                  </span>
                }
              />
              <TooltipContent>
                Interview data is encrypted at rest with your enrolled unlock
                method.
              </TooltipContent>
            </Tooltip>
          )
        ) : null}
        {durability ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  tabIndex={
                    durability.usage !== null ||
                    (!durability.persisted && installed)
                      ? 0
                      : undefined
                  }
                  className="focusable inline-flex items-center gap-1.5 rounded-sm"
                >
                  {durability.persisted ? (
                    <>
                      <HardDrive className="size-3.5" />
                      Storage persistent
                    </>
                  ) : installed ? (
                    // Installed apps are already partitioned away from
                    // browsing data and exempt from routine cleanup, and no
                    // further user action can flip the grant — a warning here
                    // would alarm without offering a remedy (#886).
                    <>
                      <HardDrive className="size-3.5" />
                      Storage best effort
                    </>
                  ) : (
                    <span className="text-warning inline-flex items-center gap-1.5">
                      <HardDrive className="size-3.5" />
                      Storage not persistent
                    </span>
                  )}
                </span>
              }
            />
            {!durability.persisted && installed ? (
              <TooltipContent>
                The browser keeps installed-app data separate from browsing data
                and does not clear it routinely, but it has not guaranteed it
                against eviction if disk space runs low. Export interviews
                regularly.
                {durability.usage !== null
                  ? ` ${formatBytes(durability.usage)} stored.`
                  : ''}
              </TooltipContent>
            ) : durability.usage !== null ? (
              <TooltipContent>
                {formatBytes(durability.usage)} stored
              </TooltipContent>
            ) : null}
          </Tooltip>
        ) : null}
        {versionSlot}
      </div>
    </motion.div>
  );
}

type StatusRowProps = {
  protocolCount: number;
  interviewCount: number;
};

export function StatusRow({ protocolCount, interviewCount }: StatusRowProps) {
  const { mode } = useAuth();
  const [durability, setDurability] = useState<Durability | null>(null);
  // Static per page load, like InstallBanner: installing mid-session still
  // requires launching the installed app.
  const [installed] = useState(isRunningInstalled);

  useEffect(() => {
    let active = true;
    const read = () => {
      void (async () => {
        const d = await readDurability();
        if (active) setDurability(d);
      })();
    };

    read();

    // A persist() grant can land after this component mounts: main.tsx requests
    // it at startup, on the first user gesture, and on install, and the auth
    // enrol path requests it when encryption is enabled. Re-read on the events
    // that follow such a grant so the durability label updates without a
    // reload — focus/visibility for a late startup grant, appinstalled for the
    // install grant, and the storage module's own event for any fresh grant it
    // observes directly.
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    window.addEventListener('appinstalled', read);
    window.addEventListener(STORAGE_PERSISTED_EVENT, read);
    return () => {
      active = false;
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
      window.removeEventListener('appinstalled', read);
      window.removeEventListener(STORAGE_PERSISTED_EVENT, read);
    };
  }, []);

  // Enabling encryption requests persistent storage in the enrol path, and that
  // grant lands with no focus/visibility change on the dashboard. Re-read when
  // the security mode changes so enrolling a secured vault (e.g. from Settings,
  // without leaving Home) clears the "Storage not persistent" warning without a
  // reload.
  useEffect(() => {
    let active = true;
    void (async () => {
      const d = await readDurability();
      if (active) setDurability(d);
    })();
    return () => {
      active = false;
    };
  }, [mode]);

  return (
    <StatusRowView
      protocolCount={protocolCount}
      interviewCount={interviewCount}
      mode={mode}
      durability={durability}
      installed={installed}
      versionSlot={<AppUpdatePill />}
    />
  );
}
