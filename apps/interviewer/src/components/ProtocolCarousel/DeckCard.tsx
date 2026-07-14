import { CalendarPlus, CalendarSync, Globe, Trash2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'wouter';

import { Pattern } from '@codaco/art';
import { buttonVariants, IconButton } from '@codaco/fresco-ui/Button';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { Skeleton } from '@codaco/fresco-ui/Skeleton';
import { proportionalLucideIconVariants } from '@codaco/fresco-ui/styles/controlVariants';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { protocolDataViewPath } from '~/components/DataView/dataViewUrlState';
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
    // layout="position": the pill glides (on the shared region clock) when
    // the delete control entering/leaving changes its position in the row.
    <motion.div
      layout="position"
      transition={REGION_TRANSITION}
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
    </motion.div>
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

// Step the heading size down as names get longer so multi-line names stay
// inside the heading's flex region instead of squeezing the description and
// footer. Thresholds are pre-wrap character counts — crude, but stable: no
// measurement loop, no reflow jitter, and the classes are static literals
// so Tailwind's scanner emits them. Names are identifiers (machine-style
// names often differ only at the END), so shrinking is preferred over
// truncation; the fitted line clamp below is only a backstop for
// pathological lengths. Each tier carries a pixel floor so the name stays
// legible on the smallest cards — when text stops shrinking, the budget
// hook trades description lines away instead.
function headingSizeClass(name: string): string {
  if (name.length <= 24) return 'text-[max(20px,8cqi)]';
  if (name.length <= 48) return 'text-[max(18px,6.5cqi)]';
  return 'text-[max(16px,5cqi)]';
}

// Ceiling on the description even when space allows — beyond this it trails
// off with an ellipsis so a long abstract can't dominate the card.
const DESCRIPTION_MAX_LINES = 6;

// The description's line height as a fraction of the card width —
// text-[max(12px,3.5cqi)] × leading-tight (1.25) on the span below. Used
// only until the span has been measured once (a card born too small to
// ever show the description), so the budget can still tell when enough
// room has returned for it to re-enter. Approximate below the 12px floor,
// where the real line height stops scaling with the card — a ±1-line
// error in when the description re-enters, nothing more.
const DESCRIPTION_FALLBACK_LINE_HEIGHT_RATIO = 0.035 * 1.25;

type CardTextBudget = {
  headingLines: number | null;
  descriptionLines: number | null;
  footerMaxHeight: number | null;
};

// Divide the card column's height between its rows, name first (#888).
// Fixed rows (controls, metadata, divider) and the footer's NATURAL height
// are reserved up front; the heading then takes as many whole lines as its
// name needs and its budget allows (never fewer than one); the description
// gets whatever remains, hiding entirely (0 lines) when even one line
// doesn't fit; and the footer is capped at the leftover so an oversized
// footer (the case-ID form on a small card) scrolls inside the card
// instead of pushing its submit button past the clipped card edge.
//
// A plain flex layout can't express this priority order: making any one
// row the flexible one sacrifices it to the others (the previous layout
// flexed the heading, so an active card's footer squeezed the title to a
// clipped single line).
//
// Stability: no output feeds back into its own inputs. Budgets are derived
// from the column height, the fixed rows' natural sizes, and arithmetic
// gap terms — never from the heading's, description's, or footer's
// ALLOCATED boxes — so applying the clamps can't re-trigger different
// clamps and oscillate.
function useCardTextBudget({
  name,
  description,
  loading,
  hideControls,
  hideMetadata,
  hideDescription,
  footerKey,
}: {
  name: string | undefined;
  description: string | undefined;
  loading: boolean;
  hideControls: boolean;
  hideMetadata: boolean;
  hideDescription: boolean;
  footerKey: string | null;
}) {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const descriptionRef = useRef<HTMLSpanElement | null>(null);
  const descriptionLineHeightRatio = useRef<number | null>(null);
  const [budget, setBudget] = useState<CardTextBudget>({
    headingLines: null,
    descriptionLines: null,
    footerMaxHeight: null,
  });

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return undefined;

    const measure = () => {
      const columnStyle = getComputedStyle(column);
      const contentHeight =
        column.clientHeight -
        parseFloat(columnStyle.paddingTop) -
        parseFloat(columnStyle.paddingBottom);
      const columnWidth = column.clientWidth;
      // jsdom (and a display:none card) reports zero dimensions — keep the
      // unclamped defaults rather than clamping everything to nothing.
      if (contentHeight <= 0 || columnWidth <= 0) return;
      const gap = parseFloat(columnStyle.rowGap) || 0;

      const rows = Array.from(column.children).filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement &&
          // popLayout pops exiting rows out of the flow (position:absolute)
          // at exit start — they no longer take space.
          getComputedStyle(el).position !== 'absolute',
      );
      const footerRow = rows.find((el) => el.dataset.deckRow === 'footer');
      const others = rows.filter((el) => el.dataset.deckRow === undefined);
      // The footer's natural (uncapped) content height: the ScrollArea
      // viewport's scrollHeight, which keeps reporting the full content
      // once the cap is applied. Resolved from the IN-FLOW row (not a ref)
      // because two footers coexist during a swap — the exiting one is out
      // of the flow but still mounted, and a shared ref could point at it.
      const footerViewport = footerRow?.querySelector('section');
      const footerNaturalHeight = footerRow
        ? Math.max(footerRow.offsetHeight, footerViewport?.scrollHeight ?? 0)
        : 0;
      const fixedHeight =
        others.reduce((sum, el) => sum + el.offsetHeight, 0) +
        footerNaturalHeight;
      const fixedRowCount = others.length + (footerRow ? 1 : 0);

      let headingLines: CardTextBudget['headingLines'] = null;
      let headingHeight = 0;
      const heading = headingRef.current;
      if (heading) {
        const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
        if (Number.isFinite(lineHeight) && lineHeight > 0) {
          const naturalLines = Math.max(
            1,
            Math.round(heading.scrollHeight / lineHeight),
          );
          // Gaps: the fixed rows plus the heading row itself.
          const headingBudget =
            contentHeight - fixedHeight - gap * fixedRowCount;
          headingLines = Math.min(
            naturalLines,
            Math.max(1, Math.floor(headingBudget / lineHeight)),
          );
          headingHeight = headingLines * lineHeight;
        }
      } else {
        // Loading: the heading row shows skeletons at a fixed size.
        const headingRow = rows.find((el) => el.dataset.deckRow === 'heading');
        headingHeight = headingRow?.offsetHeight ?? 0;
      }

      const descriptionEl = descriptionRef.current;
      if (descriptionEl) {
        const lineHeight = parseFloat(
          getComputedStyle(descriptionEl).lineHeight,
        );
        if (Number.isFinite(lineHeight) && lineHeight > 0) {
          descriptionLineHeightRatio.current = lineHeight / columnWidth;
        }
      }
      const descriptionLineHeight =
        (descriptionLineHeightRatio.current ??
          DESCRIPTION_FALLBACK_LINE_HEIGHT_RATIO) * columnWidth;
      const descriptionBudget =
        contentHeight - fixedHeight - headingHeight - gap * (fixedRowCount + 1);
      const descriptionLines =
        descriptionLineHeight > 0
          ? Math.max(
              0,
              Math.min(
                DESCRIPTION_MAX_LINES,
                Math.floor(descriptionBudget / descriptionLineHeight),
              ),
            )
          : 0;

      // null = the footer fits; it then renders as a plain (overflow
      // visible) region so nothing clips its buttons' shadows and no
      // scroll container exists to grow a scrollbar. A number = genuine
      // overflow; the footer is capped there and scrolls.
      let footerMaxHeight: CardTextBudget['footerMaxHeight'] = null;
      if (footerRow) {
        // The description skeletons (no real text yet) count as a fixed row;
        // the real span occupies exactly its clamped lines. Presence comes
        // from the IN-FLOW row scan, not descriptionRef — during a footer
        // swap the exiting description is popped out of the flow but its
        // ref is still live, and counting it would cap the incoming footer
        // (the case-ID form) a description's height too short.
        const descriptionShown =
          descriptionLines > 0 &&
          rows.some((el) => el.dataset.deckRow === 'description');
        const descriptionHeight = descriptionShown
          ? descriptionLines * descriptionLineHeight
          : 0;
        const footerAvailable =
          contentHeight -
          (fixedHeight - footerNaturalHeight) -
          headingHeight -
          descriptionHeight -
          gap * (fixedRowCount + (descriptionShown ? 1 : 0));
        // 2px tolerance: the natural height is a rounded-up integer
        // (scrollHeight) compared against a fractional budget, so a
        // sub-pixel discrepancy must not flip the footer into scroll mode
        // — a couple of pixels absorbed by the column beats a scrollbar
        // that scrolls one pixel.
        footerMaxHeight =
          footerNaturalHeight <= footerAvailable + 2
            ? null
            : Math.max(48, Math.floor(footerAvailable));
      }

      setBudget((previous) =>
        previous.headingLines === headingLines &&
        previous.descriptionLines === descriptionLines &&
        previous.footerMaxHeight === footerMaxHeight
          ? previous
          : { headingLines, descriptionLines, footerMaxHeight },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    // Rows come and go with the effect deps below; heights also move on
    // their own (the metadata row wraps, the pill appears), so observe each.
    for (const el of column.children) {
      if (el instanceof HTMLElement) observer.observe(el);
    }
    // The footer's cap freezes its row box, so content growth inside the
    // scroll viewport (a validation error appearing) is only visible on the
    // viewport's child. Observe every mounted footer's content — during a
    // swap both the entering and exiting footers exist.
    for (const content of column.querySelectorAll(
      '[data-deck-row="footer"] section > *',
    )) {
      if (content instanceof HTMLElement) observer.observe(content);
    }
    // An exiting row leaving the DOM (its pop-fade finishing) changes no
    // observed box — the row was already out of the flow — but it can shift
    // what the budget should count (a measure taken mid-exit sticks
    // otherwise). Re-measure on any child list change.
    const mutations = new MutationObserver(measure);
    mutations.observe(column, { childList: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [
    name,
    description,
    loading,
    hideControls,
    hideMetadata,
    hideDescription,
    footerKey,
  ]);

  return {
    columnRef,
    headingRef,
    descriptionRef,
    ...budget,
  };
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
  // presence group keyed by this element's key (normally
  // `<DeckCardFooter key="…">`); swapping footer content fades the old
  // footer fully out before the new one fades in, while the layout
  // reflows immediately.
  footer?: ReactNode;
  // When provided, the top-right remove control is shown and wired to it.
  onDelete?: () => void;
  deleteLabel?: string;
  // Omit the metadata row entirely (e.g. the sample-protocol preview, where
  // dates and session counts don't exist yet and skeletons would mislead).
  hideMetadata?: boolean;
  // Remove the whole top controls row (requires-internet pill + delete
  // control), surrendering its reserved height to the heading region —
  // long names need that room while the case-ID form occupies the footer.
  hideControls?: boolean;
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
// description, metadata, divider, and footer). Exits always pop out of the
// layout flow (`mode="popLayout"`), so the column reflows concurrently
// with the outgoing fade; on footer REPLACEMENTS the incoming footer's
// fade additionally waits for the outgoing one to clear (see the
// footer-key tracking in DeckCard).
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
    hideControls = false,
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

  const showMetadata = !hideMetadata;

  // The footer group's identity, taken from the consumer's key on the
  // footer element (e.g. "start-interview" → "new-session"). A change
  // between two non-null rendered keys is a REPLACEMENT: the incoming
  // footer takes its space immediately (the column reflows alongside the
  // outgoing footer's pop-fade) but holds its own fade until the outgoing
  // one has cleared, so swaps read as exit-then-enter instead of two
  // footers blended together. A fresh appearance (activation) enters with
  // no delay.
  const footerKey = isValidElement(footer) ? (footer.key ?? 'footer') : null;
  const renderedFooterKey = isActive && footer != null ? footerKey : null;

  const budget = useCardTextBudget({
    name: protocol.name,
    description: protocol.description,
    loading,
    hideControls,
    hideMetadata,
    hideDescription,
    footerKey: renderedFooterKey,
  });

  const showDescription =
    !hideDescription &&
    Boolean(protocol.description ?? loading) &&
    // The budget hides a real description outright when not even one line
    // fits; skeletons (no text yet) always show.
    (protocol.description == null ||
      budget.descriptionLines === null ||
      budget.descriptionLines > 0);
  const committedFooterKeyRef = useRef<string | null>(renderedFooterKey);
  const isFooterSwap =
    renderedFooterKey !== null &&
    committedFooterKeyRef.current !== null &&
    committedFooterKeyRef.current !== renderedFooterKey;
  useEffect(() => {
    committedFooterKeyRef.current = renderedFooterKey;
  });

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
          // No minimum size of its own: the card always fills the box it's
          // given (the text budget degrades content gracefully), so it can
          // never overflow its carousel slot or a story frame. The deck's
          // readability floor lives in ProtocolDeck's card-size computation.
          'text-navy-taupe bg-platinum publish-colors',
          'effect-shadow-xl @container relative h-full w-full overflow-clip rounded',
          isActive && 'spring-medium effect-shadow-2xl',
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
            ref={budget.columnRef}
            // Gap scales with the card (24px at the 720px maximum) so small
            // cards spend their height on content, not fixed 24px seams.
            className="relative z-10 flex size-full flex-col justify-between gap-[max(12px,3.3cqi)] p-[6cqi]"
          >
            {/* The whole controls row (pill + delete) leaves while the
                case-ID form is up — its reserved height goes to the
                heading region, which long names need. popLayout frees the
                space at exit start so the heading glides up concurrently
                with the row's fade. */}
            <AnimatePresence mode="popLayout" initial={false}>
              {!hideControls && (
                <motion.div
                  key="controls"
                  layout="position"
                  initial={PRESENCE_INITIAL}
                  animate={PRESENCE_ENTER}
                  exit={PRESENCE_EXIT}
                  transition={REGION_TRANSITION}
                  // min-h reserves the delete control's height, so the
                  // control fading in or out (e.g. a pending card becoming
                  // deletable) never reflows the content below the row.
                  className="flex min-h-[max(40px,10cqi)] shrink-0 items-center justify-end gap-4"
                >
                  {requiresInternetConnection && (
                    <Pill icon={<Globe />} intent="warning">
                      Requires Internet
                    </Pill>
                  )}

                  {/* Direct presence parent: gives the control real enter/exit
                  animations and a fresh presence context, so the outer
                  presence's initial={false} doesn't suppress later mounts.
                  popLayout frees the control's row space at exit START so
                  the pill glides concurrently with the fade. */}
                  <AnimatePresence mode="popLayout" initial={false}>
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
                </motion.div>
              )}
            </AnimatePresence>
            {/* flex-1 makes the heading row the column's spare-space
                absorber (content stays anchored to the card's top and
                bottom edges); min-h-fit stops flex from ever squeezing it
                below the clamped name — the budget hook already sized the
                clamp so the fixed rows and footer fit, so the NAME is the
                one row that can't be crushed (#888). */}
            <div
              data-deck-row="heading"
              className="flex min-h-fit flex-1 items-center justify-start overflow-hidden"
            >
              {protocol.name ? (
                <MotionHeading
                  ref={budget.headingRef}
                  level="h2"
                  title={protocol.name}
                  className={cx(
                    'w-full text-left font-black wrap-break-word hyphens-auto',
                    headingSizeClass(protocol.name),
                  )}
                  // line-height must be inline: leading-* utilities lose to
                  // the Heading component's own typography classes, so a
                  // class here silently has no effect.
                  style={{
                    lineHeight: 1.05,
                    ...(budget.headingLines === null
                      ? undefined
                      : {
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: budget.headingLines,
                          overflow: 'hidden',
                        }),
                  }}
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

            {/* popLayout: an exiting description/metadata row is popped out
                of the layout flow at exit START, so the column (and an
                entering footer, e.g. the case-ID form) reflows concurrently
                with the fade instead of waiting for the unmount. */}
            <AnimatePresence mode="popLayout" initial={false}>
              {showDescription && (
                // The description takes whatever whole lines the budget hook
                // left after the heading (capped at DESCRIPTION_MAX_LINES),
                // and unmounts entirely when not even one fits — the NAME
                // outranks it (#888). The inner span carries the clamp
                // (line-clamp makes it a `-webkit-box`); the wrapper is a
                // normal block flex item pinned with `shrink-0`. The
                // data-deck-row tag marks the row as budget-managed only
                // when it holds real text — the loading skeletons are a
                // fixed row like any other.
                // layout="position" (not full layout) on the swappable text
                // regions: full layout animations interpolate size with a
                // scale transform, which visibly stretches text when a
                // content swap changes the region's height (skeletons →
                // real description on import completion). Position-only
                // keeps the glide without the distortion.
                <motion.div
                  key="description"
                  layout="position"
                  data-deck-row={
                    protocol.description ? 'description' : undefined
                  }
                  initial={PRESENCE_INITIAL}
                  animate={PRESENCE_ENTER}
                  exit={PRESENCE_EXIT}
                  transition={REGION_TRANSITION}
                  className="shrink-0 text-left"
                >
                  {protocol.description ? (
                    <span
                      ref={budget.descriptionRef}
                      className="text-[max(12px,3.5cqi)] leading-tight text-current/80"
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp:
                          budget.descriptionLines ?? DESCRIPTION_MAX_LINES,
                        overflow: 'hidden',
                      }}
                    >
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
                  className="font-monospace flex shrink-0 items-center justify-between gap-4 text-[2.5cqi]"
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
                    <NativeLink
                      render={
                        <Link href={protocolDataViewPath(protocol.name)} />
                      }
                    >
                      {sessionCount ?? 0}{' '}
                      {sessionCount === 1 ? 'interview' : 'interviews'}
                    </NativeLink>
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
                  className="my-0 shrink-0"
                />
              )}
              {isActive && footer != null && (
                <motion.div
                  key={footerKey}
                  layout="position"
                  data-deck-row="footer"
                  initial={PRESENCE_INITIAL}
                  animate={{
                    ...PRESENCE_ENTER,
                    transition: isFooterSwap
                      ? {
                          ...REGION_TRANSITION,
                          delay: REGION_TRANSITION.duration,
                        }
                      : REGION_TRANSITION,
                  }}
                  exit={PRESENCE_EXIT}
                  transition={REGION_TRANSITION}
                  // Capped at the budget's leftover: a footer taller than the
                  // card can hold (the case-ID form on a small card) scrolls
                  // inside the ScrollArea — with its edge fade as the "there's
                  // more" hint — instead of pushing the submit button past the
                  // clipped card edge (#888). While the footer FITS
                  // (footerMaxHeight null) the viewport is overflow-visible
                  // with the fade machinery off: a scroll container would
                  // clip ink overflow (the submit button's shadow) and turn
                  // rounding noise into a one-pixel scrollbar. Scroll mode
                  // keeps ScrollArea's own vertical padding so the shadow
                  // has room at the scroll edges.
                  style={{ maxHeight: budget.footerMaxHeight ?? undefined }}
                  className="flex shrink-0 flex-col"
                >
                  <ScrollArea
                    // The footer's own controls are the tab stops; the
                    // viewport scrolls them into view on focus, so it needs
                    // no tab stop of its own.
                    tabIndex={-1}
                    fade={budget.footerMaxHeight !== null}
                    viewportClassName={
                      budget.footerMaxHeight === null
                        ? 'overflow-visible py-0'
                        : undefined
                    }
                  >
                    {footer}
                  </ScrollArea>
                </motion.div>
              )}
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
// "start-interview", "import-progress") — DeckCard reads that key to drive
// the footer presence group: key changes pop the old footer out of the
// layout flow and delay the new footer's fade until the old one clears.
// The animated element is DeckCard's own wrapper (a direct motion child of
// the AnimatePresence, which popLayout requires); this component is just
// the shared column layout.
export function DeckCardFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
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
        'flex h-auto items-center justify-center gap-[1.5cqi] border-b-[1.25cqi] p-[max(10px,2.5cqi)] text-[max(12px,3cqi)] font-extrabold tracking-widest uppercase',
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
      <div className="font-monospace flex min-h-lh items-center justify-between text-[max(11px,2.8cqi)]">
        <span>{message}</span>
        {progress !== undefined && (
          <span>{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</span>
        )}
      </div>
    </div>
  );
}
