import { HardDrive, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

const messages = defineMessages({
  interviewerAPPVERSION: {
    id: 'interviewer.statusRow.interviewerAPPVERSION',
    defaultMessage: 'Interviewer {APP_VERSION}',
    description: 'Visible copy in Interviewer Status Row.',
  },
  strongProtocolCountStrongProtocols: {
    id: 'interviewer.statusRow.strongProtocolCountStrongProtocols',
    defaultMessage:
      '{protocolCount, plural, one {<strong>#</strong> protocol} other {<strong>#</strong> protocols}}',
    description: 'Administration text in Interviewer StatusRow.',
  },
  strongInterviewCountStrongInterviews: {
    id: 'interviewer.statusRow.strongInterviewCountStrongInterviews',
    defaultMessage:
      '{interviewCount, plural, one {<strong>#</strong> interview} other {<strong>#</strong> interviews}}',
    description: 'Administration text in Interviewer StatusRow.',
  },
  notEncryptedNoAppSecurityIsEnrolled: {
    id: 'interviewer.statusRow.notEncryptedNoAppSecurityIsEnrolled',
    defaultMessage:
      'Not encrypted. No app security is enrolled — data is stored unencrypted. Enrol a PIN, passphrase, or biometric in Settings to encrypt it.',
    description: 'Visible copy in Interviewer Status Row.',
  },
  encryptedInterviewDataIsEncryptedAtRest: {
    id: 'interviewer.statusRow.encryptedInterviewDataIsEncryptedAtRest',
    defaultMessage:
      'Encrypted. Interview data is encrypted at rest with your enrolled unlock method.',
    description: 'Visible copy in Interviewer Status Row.',
  },
  storagePersistent: {
    id: 'interviewer.statusRow.storagePersistent',
    defaultMessage: 'Storage persistent',
    description: 'Visible copy in Interviewer Status Row.',
  },
  storageBestEffort: {
    id: 'interviewer.statusRow.storageBestEffort',
    defaultMessage: 'Storage best effort',
    description: 'Visible copy in Interviewer Status Row.',
  },
  storageNotPersistent: {
    id: 'interviewer.statusRow.storageNotPersistent',
    defaultMessage: 'Storage not persistent',
    description: 'Visible copy in Interviewer Status Row.',
  },
  notEncrypted: {
    id: 'interviewer.statusRow.notEncrypted',
    defaultMessage: 'Not encrypted',
    description: 'Visible copy in Interviewer Status Row.',
  },
  encrypted: {
    id: 'interviewer.statusRow.encrypted',
    defaultMessage: 'Encrypted',
    description: 'Visible copy in Interviewer Status Row.',
  },
  installedStorage: {
    id: 'interviewer.statusRow.installedStorage',
    defaultMessage:
      '{hasUsage, select, true {Storage best effort. Installed-app data is kept separate from browsing data and is not cleared routinely, but it is not guaranteed against eviction if disk space runs low. Export interviews regularly. {used} stored.} other {Storage best effort. Installed-app data is kept separate from browsing data and is not cleared routinely, but it is not guaranteed against eviction if disk space runs low. Export interviews regularly.}}',
    description: 'Administration text in Interviewer StatusRow.',
  },
  persistentStorage: {
    id: 'interviewer.statusRow.persistentStorage',
    defaultMessage:
      '{hasUsage, select, true {Storage persistent. {used} stored.} other {Storage persistent.}}',
    description: 'Administration text in Interviewer StatusRow.',
  },
  temporaryStorage: {
    id: 'interviewer.statusRow.temporaryStorage',
    defaultMessage:
      '{hasUsage, select, true {Storage not persistent. {used} stored.} other {Storage not persistent.}}',
    description: 'Administration text in Interviewer StatusRow.',
  },
});

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
// closed), so that press's own activation has to be withdrawn or a tap would
// close what it just opened.
//
// Withdrawing it is narrowly scoped, because every activation that is *not*
// that press must still toggle. Two ways to get this wrong, both of which
// strand a keyboard user on a chip they cannot operate: withdraw every
// activation and Enter can never reopen the explanation after Escape (focus
// stays on the trigger, so no further focus event arrives); arm the
// withdrawal on any focus and the first Enter after tabbing on is eaten
// instead of collapsing what tabbing on opened. So only a pointer press arms
// it — tracked across the press, since focus lands between pointerdown and
// pointerup — and a keyboard-synthesised activation (`detail === 0`) is never
// withdrawn regardless.
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
  // True between pointerdown and pointerup on the trigger, which is the window
  // the focus it causes lands in — how focus from a press is told apart from
  // focus from tabbing on.
  const pressing = useRef(false);
  // Set when a press's own focus opened the popover, and consumed by that same
  // press's click. Never set by keyboard focus.
  const openedByPress = useRef(false);

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
        if (!nextOpen) openedByPress.current = false;
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
            onPointerDown={() => {
              // A new press starts a fresh interaction, so anything left over
              // from an abandoned one (pressed, then released elsewhere) is
              // discarded rather than spent on this press's activation.
              pressing.current = true;
              openedByPress.current = false;
            }}
            onPointerUp={() => {
              pressing.current = false;
            }}
            onPointerCancel={() => {
              pressing.current = false;
            }}
            onFocus={() => {
              openedByPress.current = pressing.current;
              setOpen(true);
            }}
            onBlur={(event) => {
              if (!keepOpenFor(event.relatedTarget)) {
                openedByPress.current = false;
                setOpen(false);
              }
            }}
            onClick={(
              event: React.MouseEvent<HTMLSpanElement> & {
                preventBaseUIHandler?: () => void;
              },
            ) => {
              const openedByThisPress = openedByPress.current;
              openedByPress.current = false;
              // detail === 0 marks an activation synthesised from Enter or
              // Space, which no press can have opened — it must always toggle.
              if (openedByThisPress && event.detail !== 0) {
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
  versionSlot,
}: {
  protocolCount: number;
  interviewCount: number;
  mode: AuthMode | undefined;
  durability: Durability | null;
  installed: boolean;
  versionSlot?: React.ReactNode;
}) {
  const intl = useAppIntl();
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
          {intl.formatMessage(messages.strongProtocolCountStrongProtocols, {
            strong: (chunks) => (
              <strong className="text-text font-bold">{chunks}</strong>
            ),
            protocolCount: protocolCount,
          })}
        </span>
        <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-current" />
        <span>
          {intl.formatMessage(messages.strongInterviewCountStrongInterviews, {
            strong: (chunks) => (
              <strong className="text-text font-bold">{chunks}</strong>
            ),
            interviewCount: interviewCount,
          })}
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
                  <span className={compactLabelClassName}>
                    {intl.formatMessage(messages.notEncrypted)}
                  </span>
                </>
              }
            >
              {intl.formatMessage(messages.notEncryptedNoAppSecurityIsEnrolled)}
            </StatusChipPopover>
          ) : (
            <StatusChipPopover
              testId="encryption-status-trigger"
              className={`${statusTriggerClassName} text-primary`}
              chip={
                <>
                  <ShieldCheck className={statusIconClassName} />
                  <span className={compactLabelClassName}>
                    {intl.formatMessage(messages.encrypted)}
                  </span>
                </>
              }
            >
              {intl.formatMessage(
                messages.encryptedInterviewDataIsEncryptedAtRest,
              )}
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
                    {intl.formatMessage(messages.storagePersistent)}
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
                    {intl.formatMessage(messages.storageBestEffort)}
                  </span>
                </>
              ) : (
                <span className="text-warning inline-flex items-center gap-1.5">
                  <HardDrive className={statusIconClassName} />
                  <span className={compactLabelClassName}>
                    {intl.formatMessage(messages.storageNotPersistent)}
                  </span>
                </span>
              )
            }
          >
            {intl.formatMessage(
              !durability.persisted && installed
                ? messages.installedStorage
                : durability.persisted
                  ? messages.persistentStorage
                  : messages.temporaryStorage,
              {
                hasUsage: String(durability.usage !== null),
                used: formatBytes(durability.usage, intl),
              },
            )}
          </StatusChipPopover>
        ) : null}
        {versionSlot ?? (
          <span>
            {intl.formatMessage(messages.interviewerAPPVERSION, {
              APP_VERSION,
            })}
          </span>
        )}
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
