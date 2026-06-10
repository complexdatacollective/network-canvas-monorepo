import { CalendarPlus, CalendarSync, Globe, Trash2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  useId,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'wouter';

import { Pattern } from '@codaco/art';
import { buttonVariants, IconButton } from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { Skeleton } from '@codaco/fresco-ui/Skeleton';
import { proportionalLucideIconVariants } from '@codaco/fresco-ui/styles/controlVariants';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { cardBase } from './cardStyles';

function Pill({
  children,
  icon,
  intent,
}: {
  children: ReactNode;
  icon: ReactNode;
  intent?: 'default' | 'error' | 'success' | 'warning';
}) {
  return (
    <div
      className={cx(
        'font-monospace flex items-center gap-2 rounded-full border px-[2cqi] py-[0.75cqi] text-[max(12px,2.5cqi)] uppercase',
        proportionalLucideIconVariants(),
        'backdrop-blur-xs',
        intent === 'error' &&
          'text-destructive border-destructive bg-[color-mix(in_oklab,oklch(var(--destructive))_10%,oklch(var(--rich-black)))]/60',
        intent === 'success' &&
          'text-sea-green border-sea-green bg-[color-mix(in_oklab,oklch(var(--sea-green))_10%,oklch(var(--rich-black)))]/60',
        intent === 'warning' &&
          'text-neon-carrot border-neon-carrot bg-[color-mix(in_oklab,oklch(var(--neon-carrot))_20%,oklch(var(--rich-black)))]/60',
      )}
    >
      {icon}
      {children}
    </div>
  );
}

// CSS line-breaking treats `_` as part of a word, so an underscore is never a
// wrap opportunity on its own — only spaces, hyphens (`-`) and soft hyphens
// (U+00AD) break natively. Inject a <wbr> after each underscore so long
// machine-style names (e.g. "BRE_F03-KMP_FB_01…") can wrap there too. The
// greedy line breaker still prefers the earlier opportunities (space, then
// `-`, then `_`), falling back to hyphenation (hyphens-auto, below) only for
// an unbroken run that would otherwise overflow.
function withUnderscoreBreaks(name: string): ReactNode[] {
  const parts = name.split('_');
  return parts.flatMap((part, index) =>
    index < parts.length - 1 ? [`${part}_`, <wbr key={index} />] : [part],
  );
}

// The subset of protocol fields the card renders. In the loading state any
// of them may still be unknown; the matching area shows a skeleton until the
// value arrives.
type DeckCardData = Pick<
  ProtocolWithCounts,
  'name' | 'description' | 'importedAt' | 'lastModified'
>;

export type DeckCardProps = {
  requiresInternetConnection?: boolean;
  // Content for the card's footer slot — a start button, install button,
  // import progress, or a case-ID form. Rendered beneath a divider in a
  // `mode="wait"` presence group keyed by this element's key (normally
  // `<DeckCardFooter key="…">`), so swapping footer content animates the
  // old footer fully out before the new one enters.
  footer?: ReactNode;
  // When provided, the top-right remove control is shown and wired to it.
  onDelete?: () => void;
  deleteLabel?: string;
  // Omit the metadata row entirely (e.g. the sample-protocol preview, where
  // dates and session counts don't exist yet and skeletons would mislead).
  hideMetadata?: boolean;
  // Omit the description (e.g. while the new-session form occupies the
  // footer, so the card has room for it).
  hideDescription?: boolean;
} & (
  | {
      loading?: false;
      protocol: ProtocolWithCounts;
      isActive: boolean;
      sessionCount: number;
      onActivate: () => void;
    }
  | {
      // Loading/installing: fields render progressively as they become
      // available; missing areas show skeletons.
      loading: true;
      protocol: Partial<DeckCardData>;
      isActive?: boolean;
      sessionCount?: number;
      onActivate?: () => void;
    }
);

const MotionHeading = motion.create(Heading);

// Presence poses shared by the card's swappable regions (delete control,
// description, metadata, divider, and footer). Footer swaps use
// `mode="popLayout"`, so an outgoing footer is popped out of the layout
// flow and crossfades with the incoming one — exits and enters run
// concurrently, never in sequence.
const PRESENCE_INITIAL = { opacity: 0, y: 10 };
const PRESENCE_ENTER = { opacity: 1, y: 0 };
const PRESENCE_EXIT = { opacity: 0 };

// One timing for every swappable region — poses AND layout glides. When a
// state change touches several regions at once (activation, the case-ID
// form, install progress), identical timing makes them read as a single
// coordinated reflow instead of animations taking turns.
const REGION_TRANSITION = { duration: 0.3, ease: 'easeOut' } as const;

export function DeckCard(props: DeckCardProps) {
  const {
    protocol,
    isActive = false,
    sessionCount,
    onActivate,
    onDelete,
    deleteLabel,
    hideMetadata = false,
    hideDescription = false,
    requiresInternetConnection = false,
    footer,
  } = props;
  const loading = props.loading === true;

  const onCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Only the card itself activates. Key events bubbling up from the nested
    // delete button must not trigger a second action — that button handles
    // its own Enter/Space natively.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate?.();
    }
  };

  const id = useId();

  const showDescription =
    !hideDescription && Boolean(protocol.description ?? loading);
  const showMetadata = !hideMetadata;

  return (
    <LayoutGroup id={id}>
      <motion.div
        layout
        aria-label={`${protocol.name ?? 'Protocol'}${isActive ? ' (active)' : ''}`}
        aria-busy={loading || undefined}
        onKeyDown={onCardKeyDown}
        // Border echoes the color the Pattern paints for this protocol's seed.
        // style={{ borderColor: seedToPatternPalette(protocol.name).backgroundTop }}
        className={cx(
          cardBase(),
          'min-h-[300px] min-w-[325px]',
          'text-navy-taupe bg-platinum publish-colors',
          '@container relative h-full w-full overflow-clip rounded shadow-xl',
          isActive && 'spring-medium shadow-2xl',
          'border-platinum-dark border-[0.15cqi]',
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <Pattern
            key="pattern"
            seed={protocol.name ?? ''}
            className="absolute inset-0 size-full"
          />
          <div
            key="gradient"
            className="to-platinum from-rich-black/20 via-platinum/80 absolute inset-0 size-full bg-linear-to-b via-30% to-70%"
          />

          <div
            key="content"
            className="relative z-10 flex size-full flex-col justify-between gap-6 p-[6cqi]"
          >
            <div className="flex items-center justify-end gap-4">
              {requiresInternetConnection && (
                <Pill icon={<Globe />} intent="warning">
                  Requires Internet
                </Pill>
              )}

              {/* Direct presence parent: gives the control real enter/exit
                  animations and a fresh presence context, so the outer
                  presence's initial={false} doesn't suppress later mounts. */}
              <AnimatePresence mode="wait" initial={false}>
                {onDelete && (
                  <motion.div
                    key="delete"
                    initial={PRESENCE_INITIAL}
                    animate={PRESENCE_ENTER}
                    exit={PRESENCE_EXIT}
                    transition={REGION_TRANSITION}
                  >
                    <IconButton
                      icon={<Trash2 />}
                      aria-label={deleteLabel ?? 'Delete Protocol'}
                      variant="outline"
                      color="dynamic"
                      className="bg-rich-black/60 text-platinum size-[max(40px,10cqi)] border text-[max(16px,4cqi)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete();
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex flex-1 items-center justify-start">
              {protocol.name ? (
                <MotionHeading
                  level="h2"
                  className="w-full text-left text-[8cqi] leading-[1.1] font-black wrap-break-word hyphens-auto"
                  margin="none"
                  layout="position"
                  transition={REGION_TRANSITION}
                >
                  {withUnderscoreBreaks(protocol.name)}
                </MotionHeading>
              ) : (
                <div className="w-full">
                  <Skeleton className="h-[7cqi] w-4/5" />
                  <Skeleton className="mt-[2.5cqi] h-[7cqi] w-3/5" />
                </div>
              )}
            </div>

            <AnimatePresence initial={false}>
              {showDescription && (
                // Description shows up to six lines, then trails off.
                // line-clamp must be a static utility class so Tailwind's
                // scanner emits it — a dynamic `line-clamp-${n}` would never
                // be generated. The inner span carries the clamp (line-clamp
                // makes it a `-webkit-box`); the wrapper is a normal block
                // flex item pinned with `shrink-0` so the column — whose
                // heading claims `flex-1` — can't squeeze the description
                // below its six lines.
                // layout="position" (not full layout) on the swappable text
                // regions: full layout animations interpolate size with a
                // scale transform, which visibly stretches text when a
                // content swap changes the region's height (skeletons →
                // real description on import completion). Position-only
                // keeps the glide without the distortion.
                <motion.div
                  key="description"
                  layout="position"
                  initial={PRESENCE_INITIAL}
                  animate={PRESENCE_ENTER}
                  exit={PRESENCE_EXIT}
                  transition={REGION_TRANSITION}
                  className="shrink-0 text-left"
                >
                  {protocol.description ? (
                    <span className="line-clamp-6 text-[3.5cqi] leading-tight text-current/80">
                      {protocol.description}
                    </span>
                  ) : (
                    <div className="space-y-[1.5cqi]">
                      <Skeleton className="h-[3cqi] w-full" />
                      <Skeleton className="h-[3cqi] w-11/12" />
                      <Skeleton className="h-[3cqi] w-2/3" />
                    </div>
                  )}
                </motion.div>
              )}
              {showMetadata && (
                // A row mounting mid layout-shift (sample → installing adds
                // it below the description) must move on the same clock as
                // its gliding siblings — REGION_TRANSITION everywhere —
                // otherwise it pops in at its final rect while the
                // description is still rising, reading as the row appearing
                // ABOVE it.
                <motion.div
                  key="metadata"
                  layout="position"
                  data-testid="deck-card-metadata"
                  initial={PRESENCE_INITIAL}
                  animate={PRESENCE_ENTER}
                  exit={PRESENCE_EXIT}
                  transition={REGION_TRANSITION}
                  className="font-monospace flex items-center justify-between gap-4 text-[2.5cqi]"
                >
                  {protocol.importedAt ? (
                    <span className="flex items-center gap-2">
                      <CalendarPlus className="inline-block" size={16} />
                      <TimeAgo date={protocol.importedAt} />
                    </span>
                  ) : (
                    <Skeleton className="h-[3cqi] w-[22cqi]" />
                  )}

                  {protocol.lastModified ? (
                    <span className="flex items-center gap-2">
                      <CalendarSync className="inline-block" size={16} />
                      <TimeAgo date={protocol.lastModified} />
                    </span>
                  ) : (
                    loading && <Skeleton className="h-[3cqi] w-[22cqi]" />
                  )}

                  {loading ? (
                    sessionCount === undefined ? (
                      <Skeleton className="h-[3cqi] w-[18cqi]" />
                    ) : (
                      <span>
                        {sessionCount}{' '}
                        {sessionCount === 1 ? 'interview' : 'interviews'}
                      </span>
                    )
                  ) : (
                    <Link href="/data" className="hover:underline">
                      {sessionCount ?? 0}{' '}
                      {sessionCount === 1 ? 'interview' : 'interviews'}
                    </Link>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout">
              {isActive && footer != null && (
                <motion.hr
                  key="break"
                  layout="position"
                  initial={PRESENCE_INITIAL}
                  animate={PRESENCE_ENTER}
                  exit={PRESENCE_EXIT}
                  transition={REGION_TRANSITION}
                  className="my-0"
                />
              )}
              {isActive && footer != null && footer}
            </AnimatePresence>
          </div>
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}

// Footer building blocks for the slot above, co-located so every footer
// shares the card's container-query sizing.

// Standard footer wrapper. Give it a key identifying the CONTENT (e.g.
// "start-interview", "import-progress") — changing the key makes the
// `mode="popLayout"` AnimatePresence pop the old footer out of the layout
// flow and crossfade it with the new one.
export function DeckCardFooter({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout="position"
      className="flex flex-col"
      initial={PRESENCE_INITIAL}
      animate={PRESENCE_ENTER}
      exit={PRESENCE_EXIT}
      transition={REGION_TRANSITION}
    >
      {children}
    </motion.div>
  );
}

export function DeckCardFooterButton({
  onClick,
  color = 'success',
  icon,
  children,
}: {
  onClick: () => void;
  color?: 'success' | 'primary';
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        buttonVariants({ color }),
        'flex h-auto items-center justify-center gap-[1.5cqi] border-b-[1.25cqi] p-[2.5cqi] text-[3cqi] font-extrabold tracking-widest uppercase',
        // 3D bottom edge: the translucent black border paints over the
        // button's own background (border-box clipping), darkening whatever
        // the color resolves to in the active theme.
        'border-black/25',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function DeckCardProgressFooter({
  progress,
  message,
}: {
  // Fraction (0–1) from the protocol import process; undefined renders an
  // indeterminate bar.
  progress?: number;
  // Status line from the protocol import process (e.g. "Extracting…").
  message?: string;
}) {
  return (
    <div className="flex flex-col gap-[1.5cqi] py-[2.5cqi]">
      <ProgressBar
        orientation="horizontal"
        indeterminate={progress === undefined}
        percentProgress={
          progress === undefined
            ? 0
            : Math.min(100, Math.max(0, progress * 100))
        }
        label={message ?? 'Loading protocol'}
        className="h-[2cqi] min-h-2"
      />
      <div className="font-monospace flex min-h-lh items-center justify-between text-[2.8cqi]">
        <span>{message}</span>
        {progress !== undefined && (
          <span>{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</span>
        )}
      </div>
    </div>
  );
}
