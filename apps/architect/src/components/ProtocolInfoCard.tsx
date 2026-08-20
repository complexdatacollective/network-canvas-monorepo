import { Globe } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';

import { Pattern } from '@codaco/art';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import {
  PROTOCOL_NAME_MAX_LENGTH,
  PROTOCOL_NAME_TOO_LONG_MESSAGE,
} from '~/config';
import { useAppDispatch } from '~/ducks/hooks';
import {
  updateProtocolDescription,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';
import { useRunOnce } from '~/hooks/useRunOnce';
import { getProtocol, getProtocolName } from '~/selectors/protocol';
import countGraphemes from '~/utils/countGraphemes';
import { cx } from '~/utils/cva';

/**
 * Step the heading down as the name gets longer, mirroring interviewer's
 * DeckCard (`cardHeadingSizeClass`, #888) — which solved this for the card
 * this one is modelled on, and whose clamping was never copied across.
 *
 * The numbers are measured, not guessed. Against the real control (Nunito 900
 * on the fluid `text-*` scale) a name at the 100-grapheme limit wraps to:
 *
 *   tier        390px viewport (332px box)   768/1280px (710px box)
 *   text-4xl    5 lines                      4 lines
 *   text-2xl    5 lines                      3 lines
 *   text-xl     4 lines                      2 lines
 *   text-lg     3 lines                      2 lines
 *
 * so `text-lg` past 64 graphemes is what makes a name at the permitted maximum
 * fit the three-line bound below IN FULL at every supported width — the bound
 * and the cap have to be chosen together, or the product's own limit would
 * leave a quarter of a legal name hidden behind a scroll. Names up to 32
 * graphemes (the overwhelming majority) keep the untouched `page-heading` size.
 *
 * Three lines rather than four because the bound is what decides whether the
 * timeline stays on screen: at 1280x720 a four-line bound put the timeline's
 * first row at y=726, six pixels below the fold. At three it lands at y=676.
 *
 * THE LIMIT OF THAT GUARANTEE, stated precisely because the tier table above
 * is measured on proportional scripts. It holds for Latin and for Arabic. It
 * does NOT hold for scripts whose glyphs are full-width — Chinese, Japanese,
 * Korean — or for emoji: 100 of those measure 6 lines in the 332px box at
 * phone width, so roughly half of a legal name sits outside the painted bound
 * (they fit at 768px and above). No further tier fixes it, and one was
 * considered: a full-width glyph is about 1em wide, so 100 of them need ~100em
 * of line length, and three lines of a 332px box only supply that at a font
 * size under 10px — illegible, and worse than scrolling. The textarea is the
 * reason this is acceptable rather than a truncation: unlike a clamped static
 * heading it exposes its whole value to assistive technology and to keyboard
 * navigation regardless of what is painted. This is a paint-time bound, not a
 * content bound.
 */
const protocolNameSizeClass = (graphemes: number) => {
  if (graphemes <= 32) return '';
  if (graphemes <= 64) return 'text-2xl';
  return 'text-lg';
};

/**
 * The allowance starts being painted and starts being announced at the same
 * count. One number drives both so the two channels cannot skew — a screen
 * reader hearing "20 of 100 characters remaining" at a count where the sighted
 * counter beside the control is still hidden is two different products.
 */
const ALLOWANCE_VISIBLE_FROM = 20;

/**
 * Announce the remaining allowance only as it crosses these thresholds. A live
 * region updated on every keystroke floods a screen reader (the throttling rule
 * in `developing-in-network-canvas`), and the always-present description on the
 * control already carries the exact count for anyone who asks for it.
 */
const ANNOUNCE_THRESHOLDS = [ALLOWANCE_VISIBLE_FROM, 10, 5, 0];

const announceThresholdFor = (remaining: number) =>
  ANNOUNCE_THRESHOLDS.filter((threshold) => remaining <= threshold).pop() ??
  null;

/**
 * What the researcher is told beyond the running count: an edit the control
 * refused, or the allowance as it crosses an announcement threshold. Held apart
 * from the count so the count can stay exact on demand while the live region
 * only speaks at the thresholds — and carries `isRefusal` so the visible copy
 * can read as an error rather than as a statistic.
 */
type NameNotice = { message: string; isRefusal: boolean };

const describeAllowance = (graphemes: number) => {
  const remaining = PROTOCOL_NAME_MAX_LENGTH - graphemes;
  if (remaining >= 0) {
    return `${remaining} of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`;
  }
  const over = -remaining;
  return `${over} ${over === 1 ? 'character' : 'characters'} over the ${PROTOCOL_NAME_MAX_LENGTH} character limit`;
};

const ProtocolInfoCard = () => {
  const dispatch = useAppDispatch();
  const name = useSelector(getProtocolName);
  const protocol = useSelector(getProtocol);
  const description = protocol?.description ?? '';
  const shouldReduceMotion = useReducedMotion();
  const isFirstMount = useRunOnce('protocol-summary-entrance');
  const animate = !shouldReduceMotion && isFirstMount;

  const stageCount = protocol?.stages?.length ?? 0;
  const nodeTypeCount = Object.keys(protocol?.codebook?.node ?? {}).length;
  const edgeTypeCount = Object.keys(protocol?.codebook?.edge ?? {}).length;

  // A Geospatial stage renders an online map, so a protocol containing one
  // can't be administered offline. Mirrors interviewer's DeckCard pill.
  const requiresInternet =
    protocol?.stages?.some((stage) => stage.type === 'Geospatial') ?? false;

  const [localName, setLocalName] = useState(name ?? '');
  const nameGraphemes = countGraphemes(localName);
  const allowanceId = useId();

  const [notice, setNotice] = useState<NameNotice | null>(null);
  const lastAnnouncedThreshold = useRef<number | null>(
    announceThresholdFor(PROTOCOL_NAME_MAX_LENGTH - countGraphemes(name ?? '')),
  );

  useEffect(() => {
    setLocalName(name ?? '');
    // An external rename (undo, autosave round-trip, another surface) is not
    // the researcher typing, so it must not speak — but it does re-baseline
    // which threshold the next keystroke would be crossing.
    lastAnnouncedThreshold.current = announceThresholdFor(
      PROTOCOL_NAME_MAX_LENGTH - countGraphemes(name ?? ''),
    );
    setNotice(null);
  }, [name]);

  const handleNameChange = (raw: string) => {
    const next = raw.replace(/\n/g, ' ');
    const nextCount = countGraphemes(next);

    // Refuse only edits that push the count FURTHER past the limit. A name that
    // arrived over it (imported, or authored before this cap existed) stays
    // fully editable: every deletion is accepted, so the name is self-correcting
    // downward and nothing is ever silently truncated. A hard refusal rather
    // than soft validation because this control commits on blur with no submit
    // gate — a soft cap would leave uncommitted over-limit text on screen after
    // blur, the phantom-state class #1386 removed.
    if (nextCount > PROTOCOL_NAME_MAX_LENGTH && nextCount > nameGraphemes) {
      // Refusing in silence is the same defect in a different place: a
      // researcher who pastes a study title and watches nothing happen has been
      // told nothing at all. `isRefusal` is what paints it, so the refusal has
      // a visible channel and not only a screen-reader one.
      setNotice({ message: PROTOCOL_NAME_TOO_LONG_MESSAGE, isRefusal: true });
      return;
    }

    setLocalName(next);

    const threshold = announceThresholdFor(
      PROTOCOL_NAME_MAX_LENGTH - nextCount,
    );
    if (threshold !== lastAnnouncedThreshold.current) {
      lastAnnouncedThreshold.current = threshold;
      setNotice(
        threshold === null
          ? null
          : { message: describeAllowance(nextCount), isRefusal: false },
      );
      return;
    }

    // An accepted edit that crosses no threshold empties the region: it says
    // each message exactly once, and clears a refusal the researcher has since
    // resolved rather than leaving it to be read back later. Emptying a live
    // region announces nothing.
    setNotice(null);
  };

  /**
   * Blur changes the value without a keystroke — it trims, or rolls a blank
   * draft back — so everything ELSE derived from the name has to arrive at the
   * committed value with it. Resyncing only `localName` moves the phantom out
   * of the field and into the control's own description: the paragraph below
   * renders `notice` IN PREFERENCE to the live count and forces itself visible
   * whenever one exists, so a notice left on the phantom's reading has the
   * control's `aria-describedby` describing a name it does not hold.
   *
   * The baseline re-bases to the committed value's band, exactly as the
   * external-rename effect above does. It decides what the NEXT keystroke
   * counts as a crossing, so a baseline stranded on the phantom's band
   * swallows the next genuine one in silence.
   *
   * The allowance notice is dropped rather than recomputed, because the only
   * announcement a blur could produce is one nobody should hear: trimming can
   * only shorten the name, and `announceThresholdFor` is monotonic in what
   * remains, so the committed band is always the same or LOOSER than the
   * phantom's — the message would always be "you have more room than I just
   * told you", spoken after focus has already left the control. Dropping it is
   * not a loss of information: the paragraph falls straight back to
   * `describeAllowance` of the committed count, which is the true reading, at
   * the visibility that count earns.
   *
   * A refusal survives, because it is not a measurement of the value. It says
   * an edit was rejected; the value never took those characters, and trimming
   * whitespace off what the researcher was left with does not make it untrue.
   * Clearing it here would delete the only visible evidence that a paste was
   * dropped, at the moment the researcher looks away. The next accepted
   * keystroke clears it, as it always has.
   */
  const resyncNameChannels = (committed: string) => {
    lastAnnouncedThreshold.current = announceThresholdFor(
      PROTOCOL_NAME_MAX_LENGTH - countGraphemes(committed),
    );
    setNotice((current) => (current?.isRefusal ? current : null));
  };

  const [localDescription, setLocalDescription] = useState(description);

  // Only adopt the prop when it actually changes, so an unrelated store update
  // (e.g. an autosave/validation round-trip) can't clobber in-progress typing
  // by re-running this sync with an unchanged description.
  const lastSyncedDescription = useRef(description);
  useEffect(() => {
    if (description !== lastSyncedDescription.current) {
      lastSyncedDescription.current = description;
      setLocalDescription(description);
    }
  }, [description]);

  return (
    <motion.div
      initial={animate ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="text-navy-taupe bg-platinum border-platinum-dark relative mx-auto w-full max-w-3xl overflow-hidden rounded border shadow-xl"
    >
      {/* The pattern fills the whole card; a top-to-bottom gradient lets it
          read at the top, then fades to opaque platinum so the editable
          content below stays legible. Mirrors interviewer's DeckCard. */}
      <Pattern
        aria-hidden
        seed={name ?? 'Network Canvas Protocol'}
        className="absolute inset-0 size-full"
      />
      <div className="from-rich-black/25 via-platinum/50 to-platinum absolute inset-0 size-full bg-linear-to-b via-20% to-45%" />

      <div className="relative z-10 flex flex-col gap-5 p-7">
        {/* Top controls row — reserves space above the heading (pushing the
            dark title clear of the gradient's dark top) and houses the
            requires-internet pill, mirroring interviewer's DeckCard. */}
        <div className="flex min-h-14 items-start justify-end">
          {requiresInternet && (
            <span className="text-neon-carrot border-neon-carrot bg-rich-black/60 font-monospace flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs uppercase backdrop-blur-sm">
              <Globe className="size-4" />
              Requires Internet
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {/* A textarea (not an input) so long names wrap onto multiple lines —
              the card's flexible height grows to fit. field-sizing-content
              auto-grows it; Enter commits (blurs) rather than inserting a
              newline, and newlines are stripped so the name stays single-line.

              `max-h-[3lh]` is the load-bearing bound. Under `field-sizing:
              content` the control's height is a pure function of the stored
              value's wrapped line count, so without a max-height ANY value can
              grow the card past the viewport and push the stage timeline below
              the fold — a 342-character name measured 703px tall inside a 720px
              viewport, with the timeline's first row at y=1189. The bound is in
              `lh` so it is exactly three lines at every width and in every size
              tier, and it applies to values the cap never saw (imported or
              pre-cap names), which is what makes legacy protocols safe on load.
              `dir="auto"` gives an RTL name an RTL base direction so it reads
              and truncates from the correct end. */}
          <textarea
            rows={1}
            dir="auto"
            className={headingVariants({
              level: 'h1',
              variant: 'page-heading',
              margin: 'none',
              className: cx(
                'text-navy-taupe placeholder:text-navy-taupe/50 focus-visible:ring-sea-green field-sizing-content w-full resize-none rounded-sm border-none bg-transparent p-0 font-black outline-none focus-visible:ring-2 focus-visible:outline-none',
                'max-h-[3lh] overflow-hidden wrap-break-word',
                protocolNameSizeClass(nameGraphemes),
              ),
            })}
            value={localName}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              const trimmed = localName.trim();
              if (!trimmed) {
                setLocalName(name ?? '');
                resyncNameChannels(name ?? '');
                return;
              }
              // Resync unconditionally, before the dispatch guard. A
              // whitespace-only edit trims back to the stored name, so the
              // guard below correctly declines to dispatch — but without this
              // the control would keep the untrimmed string, and everything
              // measured from it (the size tier, the remaining allowance, the
              // counter's visibility) would read off a value that was never
              // saved. When the value carries no surrounding whitespace this
              // is not a re-render at all — React bails out on an identical
              // state value — and when a real rename carries whitespace (the
              // `'  Blur commit  '` case in the tests) it is a genuine state
              // change that repaints the control with what was committed.
              setLocalName(trimmed);
              // The value is one of three channels the name feeds. The notice
              // and the announcement baseline are the other two, and a blur
              // that corrects only the first leaves them describing the
              // uncommitted string. See `resyncNameChannels`.
              resyncNameChannels(trimmed);
              // Clicking into the field and out again is not an edit, so it
              // does not dispatch one — the same guard the description field
              // below has always had. (The timeline refuses to record a change
              // that isn't one, so this is about not dispatching something
              // meaningless rather than about the history.)
              if (trimmed !== name) {
                dispatch(updateProtocolName({ name: trimmed }));
              }
            }}
            placeholder="Enter protocol name..."
            aria-label="Protocol name"
            aria-describedby={allowanceId}
          />

          {/* One line, two jobs. It is ALWAYS in the accessibility tree as the
              control's description, so focusing the control states the limit
              (AC1's "communicate"). It is painted once the allowance is nearly
              spent — so a short name carries no chrome — and unconditionally
              whenever there is a notice, which is what gives a refused edit a
              visible channel: the control drops the keystrokes, and without
              this a sighted researcher pasting a long study title would see
              literally nothing happen. Mirrors fresco-ui's `FieldErrors`, which
              keeps one element mounted and toggles `sr-only` on it rather than
              mounting a message element on demand.

              Not itself a live region: its text changes on every keystroke, and
              `aria-describedby` is read on focus rather than on change. The
              announcing is the throttled region below.

              A refusal takes `FieldErrors`' boxed treatment rather than its
              plain `text-destructive` one, for the reason that component's own
              comment gives: plain destructive text is for the interview theme's
              dark ground. Measured on this card, tomato on platinum is 4.39:1 —
              under WCAG AA's 4.5:1 for text this size — while
              `destructive-contrast` on `destructive` is 4.94:1. */}
          <p
            id={allowanceId}
            className={cx(
              'font-monospace text-xs tracking-wide uppercase',
              notice?.isRefusal
                ? 'bg-destructive text-destructive-contrast w-fit rounded-sm px-2 py-0.5'
                : 'text-navy-taupe/70',
              !notice &&
                PROTOCOL_NAME_MAX_LENGTH - nameGraphemes >
                  ALLOWANCE_VISIBLE_FROM &&
                'sr-only',
            )}
          >
            {notice?.message ?? describeAllowance(nameGraphemes)}
          </p>

          <span role="status" className="sr-only">
            {notice?.message ?? ''}
          </span>
        </div>

        <TextAreaField
          aria-label="Protocol description"
          className="[&>textarea]:field-sizing-content [&>textarea]:max-h-52 [&>textarea]:min-h-24"
          placeholder="Enter a description for your protocol..."
          value={localDescription}
          onChange={(value) => setLocalDescription(value ?? '')}
          onBlur={() => {
            if (localDescription !== description) {
              dispatch(
                updateProtocolDescription({
                  description: localDescription,
                }),
              );
            }
          }}
        />

        <div className="text-navy-taupe/70 font-monospace flex flex-wrap items-center gap-2 text-xs tracking-wide uppercase">
          <span>
            {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
          </span>
          <span aria-hidden>/</span>
          <NativeLink render={<Link href="/protocol/codebook" />}>
            {nodeTypeCount} node {nodeTypeCount === 1 ? 'type' : 'types'}
          </NativeLink>
          <span aria-hidden>/</span>
          <NativeLink render={<Link href="/protocol/codebook" />}>
            {edgeTypeCount} edge {edgeTypeCount === 1 ? 'type' : 'types'}
          </NativeLink>
        </div>
      </div>
    </motion.div>
  );
};

export default ProtocolInfoCard;
