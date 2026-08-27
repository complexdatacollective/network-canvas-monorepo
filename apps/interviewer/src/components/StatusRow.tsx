import { HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'wouter';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
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

const compactLabelClassName =
  'tablet-landscape:not-sr-only sr-only tablet-landscape:whitespace-nowrap';
const statusTriggerClassName =
  'focusable inline-flex cursor-help items-center gap-1.5 rounded-sm';
const statusIconClassName = 'tablet-landscape:size-3.5 size-4';

// The chips' explanations used to be Tooltips, which only open on hover and
// keyboard focus — on a tablet (the primary field platform) no gesture could
// reveal them. A popover opens on tap as well, so hover, focus, and touch all
// reach the same text. This mirrors fresco-ui Definition's interactive
// pattern, with the popover controlled and focus/hover opening it.
//
// The one subtlety is the trigger's own activation. A press on an unfocused
// trigger fires focus (which opens) and then click (which would toggle back
// closed), so that first activation has to be withdrawn or a tap would close
// what it just opened. Only that one: every other activation must still
// toggle, otherwise a keyboard user who presses Escape is stranded — focus
// stays on the trigger, so no further focus event arrives, and Enter or Space
// could never reopen the explanation.
function StatusChipPopover({
  testId,
  className,
  chip,
  children,
}: {
  testId: string;
  className?: string;
  /** The always-visible chip contents (icon + compact label). */
  chip: React.ReactNode;
  /** The explanation revealed on hover, focus, or tap. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Set when focus opened the popover, and consumed by the activation that
  // immediately follows — the two halves of a single press on an unfocused
  // trigger. Cleared on every close so a later activation toggles normally.
  const openedByFocus = useRef(false);

  const keepOpenFor = (target: EventTarget | null) =>
    target instanceof Node &&
    Boolean(
      triggerRef.current?.contains(target) ||
      contentRef.current?.contains(target),
    );

  return (
    <Popover
      open={open}
      triggerId={triggerId}
      onOpenChange={(nextOpen, eventDetails) => {
        // The pointer leaving must not dismiss a popover that keyboard focus
        // (or the click that focused the trigger) is still holding open.
        if (
          !nextOpen &&
          eventDetails.reason === 'trigger-hover' &&
          keepOpenFor(document.activeElement)
        ) {
          return;
        }
        if (!nextOpen) openedByFocus.current = false;
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        id={triggerId}
        openOnHover
        nativeButton={false}
        render={
          <span
            ref={triggerRef}
            id={triggerId}
            tabIndex={0}
            data-testid={testId}
            className={className}
            onFocus={() => {
              openedByFocus.current = true;
              setOpen(true);
            }}
            onBlur={(event) => {
              if (!keepOpenFor(event.relatedTarget)) {
                openedByFocus.current = false;
                setOpen(false);
              }
            }}
            onClick={(
              event: React.MouseEvent<HTMLSpanElement> & {
                preventBaseUIHandler?: () => void;
              },
            ) => {
              if (openedByFocus.current) {
                openedByFocus.current = false;
                event.preventBaseUIHandler?.();
              }
            }}
          >
            {chip}
          </span>
        }
      />
      <PopoverContent
        ref={contentRef}
        side="top"
        className="max-w-[min(var(--available-width),var(--container-sm))] text-sm text-pretty"
        aria-labelledby={triggerId}
        initialFocus={false}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!keepOpenFor(event.relatedTarget)) setOpen(false);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

// Pure presentation: the dashboard's bottom-of-screen footer strip. `mode` is
// the security mode to display (the container maps an unconfigured vault to
// 'none'; undefined means the auth state hasn't settled and renders no
// encryption statement); `durability` mirrors the storage-persistence poll
// (null until the first check resolves).
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
      className="font-monospace text-text/60 tablet-landscape:justify-between laptop:px-11 flex items-center justify-end px-6 pb-4 text-xs"
    >
      <Link
        href="/data"
        className="tablet-landscape:inline-flex hidden cursor-pointer items-center gap-3.5 text-current no-underline"
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
            <StatusChipPopover
              testId="encryption-status-trigger"
              className={`${statusTriggerClassName} text-warning`}
              chip={
                <>
                  <ShieldAlert className={statusIconClassName} />
                  <span className={compactLabelClassName}>Not encrypted</span>
                </>
              }
            >
              Not encrypted. No app security is enrolled — data is stored
              unencrypted. Enrol a PIN, passphrase, or biometric in Settings to
              encrypt it.
            </StatusChipPopover>
          ) : (
            <StatusChipPopover
              testId="encryption-status-trigger"
              className={`${statusTriggerClassName} text-primary`}
              chip={
                <>
                  <ShieldCheck className={statusIconClassName} />
                  <span className={compactLabelClassName}>Encrypted</span>
                </>
              }
            >
              Encrypted. Interview data is encrypted at rest with your enrolled
              unlock method.
            </StatusChipPopover>
          )
        ) : null}
        {durability ? (
          // Always interactive — below the tablet-landscape breakpoint the
          // label is sr-only, so the popover is the only way a sighted touch
          // user can read what the icon means, even when no usage figure is
          // available yet.
          <StatusChipPopover
            testId="storage-status-trigger"
            className={statusTriggerClassName}
            chip={
              durability.persisted ? (
                <span className="text-primary inline-flex items-center gap-1.5">
                  <HardDrive className={statusIconClassName} />
                  <span className={compactLabelClassName}>
                    Storage persistent
                  </span>
                </span>
              ) : installed ? (
                // Installed apps are already partitioned away from
                // browsing data and exempt from routine cleanup, and no
                // further user action can flip the grant — a warning here
                // would alarm without offering a remedy (#886).
                <>
                  <HardDrive className={statusIconClassName} />
                  <span className={compactLabelClassName}>
                    Storage best effort
                  </span>
                </>
              ) : (
                <span className="text-warning inline-flex items-center gap-1.5">
                  <HardDrive className={statusIconClassName} />
                  <span className={compactLabelClassName}>
                    Storage not persistent
                  </span>
                </span>
              )
            }
          >
            {!durability.persisted && installed ? (
              <>
                Storage best effort. Installed-app data is kept separate from
                browsing data and is not cleared routinely, but it is not
                guaranteed against eviction if disk space runs low. Export
                interviews regularly.
                {durability.usage !== null
                  ? ` ${formatBytes(durability.usage)} stored.`
                  : ''}
              </>
            ) : durability.persisted ? (
              <>
                Storage persistent.
                {durability.usage !== null
                  ? ` ${formatBytes(durability.usage)} stored.`
                  : ''}
              </>
            ) : durability.usage !== null ? (
              <>
                Storage not persistent. {formatBytes(durability.usage)} stored.
              </>
            ) : (
              <>Storage not persistent.</>
            )}
          </StatusChipPopover>
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
  const { kind, mode } = useAuth();
  // A never-configured vault stores data exactly as an enrolled 'none' vault
  // does — unencrypted — so the footer must state "Not encrypted" there too,
  // not stay silent. Keyed on kind, not `mode ?? 'none'`: mode is also
  // undefined while 'loading' (and for 'corrupt'), where the truthful display
  // is no statement rather than a false "Not encrypted" flash.
  const displayMode = kind === 'unconfigured' ? 'none' : mode;
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
    // it on the first user gesture and on install, and the auth enrol path
    // requests it when encryption is enabled. Re-read on the events that follow
    // such a grant so the durability label updates without a reload —
    // focus/visibility after a permission decision, appinstalled for the install
    // grant, and the storage module's own event for any fresh grant it observes.
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
      mode={displayMode}
      durability={durability}
      installed={installed}
      versionSlot={<AppUpdatePill />}
    />
  );
}
