'use client';

import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMergeRefs } from 'react-best-merge-refs';

import { useFitText } from './hooks/useFitText';
import {
  type ActivationSource,
  type NodeDragEndInfo,
  useNodeGestures,
} from './hooks/useNodeGestures';
import { useNodeInteractions } from './hooks/useNodeInteractions';
import usePrevious from './hooks/usePrevious';
import {
  useSafeAnimate,
  useShouldSkipAnimations,
} from './hooks/useSafeAnimate';
import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';
import { composeEventHandlers } from './utils/composeEventHandlers';
import { cva, type VariantProps } from './utils/cva';

export type NodeShape = 'circle' | 'square' | 'diamond';

export type { ActivationSource, NodeDragEndInfo };

// TODO: should be part of protocol-validation
export const NodeColors = [
  'node-color-seq-1',
  'node-color-seq-2',
  'node-color-seq-3',
  'node-color-seq-4',
  'node-color-seq-5',
  'node-color-seq-6',
  'node-color-seq-7',
  'node-color-seq-8',
  'custom',
] as const;

export type NodeColorSequence = (typeof NodeColors)[number];

const nodeVariants = cva({
  base: [
    'focusable relative inline-flex items-center justify-center',
    'aspect-square min-w-0 shrink-0',
    'text-white',
    '[--base:var(--node-1)] [--dark:oklch(from_var(--base)_calc(l-0.05)_c_h)]',
  ],
  variants: {
    size: {
      xxs: 'size-8',
      xs: 'size-16',
      sm: 'size-24',
      md: 'tablet-portrait:size-32 size-28',
      lg: 'tablet-portrait:size-40 size-32',
    },
    shape: {
      circle: 'rounded-full',
      square: 'rounded',
      diamond: 'rounded',
    },
    color: {
      'node-color-seq-1': 'outline-node-1 [--base:var(--node-1)]',
      'node-color-seq-2': 'outline-node-2 [--base:var(--node-2)]',
      'node-color-seq-3': 'outline-node-3 [--base:var(--node-3)]',
      'node-color-seq-4': 'outline-node-4 [--base:var(--node-4)]',
      'node-color-seq-5': 'outline-node-5 [--base:var(--node-5)]',
      'node-color-seq-6': 'outline-node-6 [--base:var(--node-6)]',
      'node-color-seq-7': 'outline-node-7 [--base:var(--node-7)]',
      'node-color-seq-8': 'outline-node-8 [--base:var(--node-8)]',
      'custom': '', // Custom color - set via style prop
    },
    disabled: {
      true: 'pointer-events-none saturate-50',
      false: '',
    },
  },
  compoundVariants: [
    // Scale border-radius proportionally (~25% of node size)
    { shape: 'square', size: 'xxs', class: 'rounded-[8px]' },
    { shape: 'square', size: 'xs', class: 'rounded-[16px]' },
    { shape: 'square', size: 'sm', class: 'rounded-[24px]' },
    // md uses default 'rounded' (~28px)
    { shape: 'square', size: 'lg', class: 'rounded-[34px]' },
    // Diamond uses the same proportional radius as square
    { shape: 'diamond', size: 'xxs', class: 'rounded-[8px]' },
    { shape: 'diamond', size: 'xs', class: 'rounded-[16px]' },
    { shape: 'diamond', size: 'sm', class: 'rounded-[24px]' },
    { shape: 'diamond', size: 'lg', class: 'rounded-[34px]' },
  ],
  defaultVariants: {
    size: 'md',
    shape: 'circle',
    color: 'node-color-seq-1',
    disabled: false,
  },
});

// Background layer carrying the gradient and, for diamonds, the rotation.
// Shape transforms must live here rather than on the root element: the root
// receives inline `transform` positioning (e.g. translate(-50%, -50%)
// centering on the sociogram canvas) and motion layout projection, both of
// which compose incorrectly with static `rotate`/`scale` properties.
const shapeLayerVariants = cva({
  base: [
    'pointer-events-none absolute inset-0 rounded-[inherit]',
    'bg-[linear-gradient(145deg,var(--base)_0%,var(--base)_50%,var(--dark)_50%,var(--dark)_100%)]',
  ],
  variants: {
    shape: {
      circle: '',
      square: '',
      diamond: 'scale-[0.85] rotate-45',
    },
  },
  defaultVariants: {
    shape: 'circle',
  },
});

export const labelVariants = cva({
  base: [
    'w-[80%] min-w-0 overflow-hidden text-center',
    'wrap-anywhere hyphens-auto whitespace-pre-line',
  ],
  variants: {
    size: {
      xxs: 'line-clamp-1 text-xs leading-none!',
      xs: 'line-clamp-2 text-xs leading-4!',
      sm: 'line-clamp-3 text-sm leading-5!',
      md: 'line-clamp-3 text-base leading-5!',
      lg: 'line-clamp-3 text-lg leading-6!',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type NodeSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg';

/**
 * Type sizes a label steps down through when it doesn't fit, smallest-first
 * after the size's own default. `text-xs` is the floor: below that a name stops
 * being legible at arm's length on a tablet, which is worse than clipping it.
 *
 * Each rung keeps the label block within the space the shape actually shows —
 * the content layer clips to the node's border radius, so a circle can only
 * hold text inside its inscribed box. Rungs trade line height for line count
 * rather than growing the block.
 */
const LABEL_FIT_OVERRIDES: Record<NodeSize, readonly string[]> = {
  // Already at the floor, and too small to hold a second line.
  xxs: [],
  xs: [],
  // `sm` is the tightest node. A fourth line only clears the inscribed box of a
  // 96px circle on a tighter leading, so this rung buys the line from the line
  // height rather than from the label's width — narrowing the label instead
  // costs more characters per line than the extra line returns.
  sm: ['text-xs leading-[1.15]! line-clamp-4'],
  md: ['text-sm leading-5! line-clamp-3', 'text-xs leading-4! line-clamp-4'],
  lg: ['text-base leading-5! line-clamp-3', 'text-sm leading-4! line-clamp-4'],
};

const buildFitSteps = (size: NodeSize): readonly [string, ...string[]] => [
  // The first rung is the size's untouched default, so a label that already
  // fits renders exactly as it did before fitting existed.
  labelVariants({ size }),
  ...LABEL_FIT_OVERRIDES[size].map((className) =>
    labelVariants({ size, className }),
  ),
];

const LABEL_FIT_STEPS: Record<NodeSize, readonly [string, ...string[]]> = {
  xxs: buildFitSteps('xxs'),
  xs: buildFitSteps('xs'),
  sm: buildFitSteps('sm'),
  md: buildFitSteps('md'),
  lg: buildFitSteps('lg'),
};

export function truncateNodeLabel(label: string, maxLength = 35): string {
  if (label.length <= maxLength) return label;
  // Use a soft hyphen (\u{AD}) to allow breaking long words if needed
  return `${label.substring(0, maxLength - 4)}\u{AD}...`;
}

type UINodeProps = {
  /** Text label displayed inside the node */
  label?: string;
  /** Accessibility label for the node button. Falls back to `label` if not provided. */
  ariaLabel?: string;
  /** Whether the node is loading */
  loading?: boolean;
  /** Whether the node is selected (toggle state) */
  selected?: boolean;
  /** Whether the node is in linking mode (externally controlled) */
  linking?: boolean;
  /** Whether the node is highlighted (e.g. via highlight behavior) */
  highlighted?: boolean;
  /** External pointer down handler (composes with internal behavior) */
  onPointerDown?: (e: React.PointerEvent) => void;
  /** External pointer up handler (composes with internal behavior) */
  onPointerUp?: (e: React.PointerEvent) => void;
  /**
   * Activation — a tap, or Enter/Space from the keyboard. The node's gesture
   * recognizer guarantees this never fires for a gesture that resolved as a
   * hold or a drag. `details.source` says how the node was activated, since a
   * keyboard press carries none of a pointer gesture's state.
   */
  onClick?: (
    event: MouseEvent<HTMLButtonElement>,
    // Always passed, but optional in the type so a handler written for a
    // plain button — or Node's own onClick forwarded to one — stays
    // assignable in both directions.
    details?: { source: ActivationSource },
  ) => void;
  /**
   * A press held still for the hold duration. Fires in addition to the node's
   * own hold behaviour (revealing a clipped label). The click that would
   * follow the gesture is swallowed — a hold is never also a tap.
   */
  onLongPress?: () => void;
  /**
   * Movement past the drag threshold, when the node itself owns dragging.
   * Providing any drag handler makes the node draggable: it takes pointer
   * capture, shows the grab/grabbing cursor, reports `aria-grabbed`, and
   * guarantees a drag is never also a tap or a hold. Hosts own the effects —
   * where the node moves, what the payload is.
   */
  onDragStart?: (event: PointerEvent) => void;
  /** Every movement of an active drag, including the one that started it. */
  onDragMove?: (event: PointerEvent) => void;
  /** The end of an active drag — released, or cancelled by the system. */
  onDragEnd?: (event: PointerEvent, info: NodeDragEndInfo) => void;
  /** Suppresses the press-and-hold reveal for clipped labels */
  labelRevealDisabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
} & VariantProps<typeof nodeVariants> &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | 'color'
    | 'onClick'
    | 'onPointerDown'
    | 'onPointerUp'
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onAnimationStart'
    | 'onAnimationEnd'
  >;

/**
 * Renders a Node - the fundamental representation of an entity in Network Canvas.
 *
 * Visual states:
 * - Focus: outline ring (via focusable utility)
 * - Selected: box-shadow ring with spring animation (on the shape layer)
 * - Linking: pulsing box-shadow ring (separate layer, can be active with selected)
 * - Disabled: desaturated, no pointer events
 *
 * Gestures: the node is the single recognizer for its own pointer sequence.
 * Handlers declare which gestures exist — `onClick` (tap/keyboard), the
 * built-in hold (clipped-label reveal, plus `onLongPress`), and
 * `onDragStart`/`Move`/`End` — and the node classifies each gesture as
 * exactly one of them, and renders every visual consequence itself: press
 * animation and pointer cursor for taps, the filling indicator for holds,
 * grab/grabbing cursor and `aria-grabbed` for drags, and a tab stop whenever
 * any of them (or a revealable label) gives focus something to do.
 *
 * An external drag system may still compose its own pointer handlers
 * (`useDragSource`); the recognizer then treats movement as belonging to that
 * system and only withdraws its own hold.
 *
 * Shapes:
 * - Circle (default), square, or diamond. The shape (including the diamond's
 *   rotation) is rendered by an inner background layer so the root element
 *   stays transform-free — inline `transform` positioning and motion layout
 *   animations would otherwise compose incorrectly with the rotation.
 */
export default function Node(props: UINodeProps) {
  const {
    label = 'Node',
    ariaLabel,
    color,
    shape,
    selected = false,
    linking = false,
    highlighted = false,
    loading = false,
    disabled = false,
    size = 'md',
    className,
    style,
    ref,
    onPointerDown: externalPointerDown,
    onPointerUp: externalPointerUp,
    onKeyDown: externalKeyDown,
    onKeyUp: externalKeyUp,
    onClick,
    onLongPress,
    onDragStart,
    onDragMove,
    onDragEnd,
    labelRevealDisabled = false,
    ...buttonProps
  } = props;

  const hasClickHandler = !!onClick;
  // Any drag handler makes the node draggable; the recognizer owns the rest.
  const dragEnabled = !!(onDragStart || onDragMove || onDragEnd);

  // aria-pressed is only valid on roles that support it (button, menuitem, etc.)
  // When a Collection overrides role to 'option', aria-pressed is not permitted.
  const roleFromProps = buttonProps.role;
  const supportsAriaPressed =
    !roleFromProps ||
    ['button', 'menuitem', 'menuitemradio', 'menuitemcheckbox'].includes(
      roleFromProps,
    );

  // Use the interaction hook for press animation
  const { scope, nodeProps } = useNodeInteractions({
    hasClickHandler,
    disabled,
  });

  // Fit the label to the node rather than clipping it at a fixed size, so most
  // names are readable in full without any interaction at all.
  const labelBoxRef = useRef<HTMLSpanElement>(null);
  const fitSteps = LABEL_FIT_STEPS[size ?? 'md'];
  const {
    ref: labelRef,
    stepIndex,
    isTruncated,
  } = useFitText<HTMLSpanElement>({
    steps: fitSteps,
    containerRef: labelBoxRef,
    watch: label,
    enabled: !loading,
  });

  // A keyboard drag already owns arrow keys and the node's position; revealing
  // the label on top of that is noise.
  const grabbed = buttonProps['aria-grabbed'];
  const isGrabbed = grabbed === true || grabbed === 'true';

  const [labelRevealed, setLabelRevealed] = useState(false);
  const canRevealLabel =
    isTruncated && !loading && !disabled && !isGrabbed && !labelRevealDisabled;

  const handleLongPress = useCallback(() => {
    if (canRevealLabel) setLabelRevealed(true);
    onLongPress?.();
  }, [canRevealLabel, onLongPress]);

  // A label already on screen has to come down when it stops being applicable.
  // Starting a keyboard drag flips `aria-grabbed` without moving focus, so
  // nothing else would close a popup opened by that focus.
  useEffect(() => {
    if (!canRevealLabel) setLabelRevealed(false);
  }, [canRevealLabel]);

  // A drag withdraws a revealed label — pointer drags set no `aria-grabbed`
  // (that is the drag system moving the node, not the node describing itself),
  // so without this the label would trail the node and outlast the drop.
  const withdrawLabel = useCallback(() => setLabelRevealed(false), []);

  const {
    onPointerDown: startGesture,
    shouldSuppressClick,
    isHolding,
    isDragging,
    feedbackDuration,
  } = useNodeGestures({
    onLongPress: handleLongPress,
    onHoldInterrupted: withdrawLabel,
    onDragStart,
    onDragMove,
    onDragEnd,
    holdEnabled: canRevealLabel || !!onLongPress,
    dragEnabled,
    disabled,
  });

  const skipAnimations = useShouldSkipAnimations();

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Only a press that actually begins a gesture dismisses what the last one
      // revealed. A second finger arriving on a node whose label is already
      // open is not a new gesture — the hold owns it until it ends — and
      // closing here would snatch the label away mid-read.
      if (startGesture(event)) setLabelRevealed(false);
    },
    [startGesture],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // The recognizer classified this gesture as a hold or a drag; it is not
      // also a tap.
      if (shouldSuppressClick()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Keyboard activations arrive as clicks with no preceding pointer
      // gesture; `detail` is the number of pointer presses behind the click.
      onClick?.(event, {
        source: event.detail === 0 ? 'keyboard' : 'pointer',
      });
    },
    [onClick, shouldSuppressClick],
  );

  // Every visual and semantic consequence of the declared gestures is decided
  // here, not by the host: cursor, touch behaviour, and the tab stop.
  const cursor: CSSProperties['cursor'] = disabled
    ? 'not-allowed'
    : (style?.cursor ??
      (isDragging
        ? 'grabbing'
        : dragEnabled
          ? 'grab'
          : hasClickHandler
            ? 'pointer'
            : 'default'));

  // Focusable exactly when focus does something *for a keyboard user*:
  // activation (Enter/Space work natively), a clipped label that focus will
  // reveal, or keyboard handlers the host supplies (a canvas provides
  // arrow-key nudging and Delete). Holds and drags are pointer-only gestures —
  // granting them a tab stop would hand keyboard users a dead control.
  const focusable =
    hasClickHandler || canRevealLabel || !!externalKeyDown || !!externalKeyUp;

  // Scope for selected state animation (box-shadow on the shape layer, so
  // the ring follows the shape's border radius and rotation)
  const [stateScope, animate] = useSafeAnimate<HTMLSpanElement>();

  // Track previous states for animation transitions
  const prevSelected = usePrevious(selected);
  const prevHighlighted = usePrevious(highlighted);

  // Box-shadow animation for selected and highlighted states
  useEffect(() => {
    if (!stateScope.current) return;

    const isActive = selected || highlighted;
    const wasActive = prevSelected === true || prevHighlighted === true;

    if (isActive && !wasActive) {
      // Spring animation - overshoots then rebounds to resting state
      void animate(
        stateScope.current,
        {
          boxShadow: [
            '0 0 0 0 var(--selected)',
            '0 0 0 0.5em var(--selected)',
            '0 0 0 0.3em var(--selected)',
          ],
        },
        {
          duration: 0.4,
          ease: [0.34, 1.56, 0.64, 1],
        },
      );
    } else if (!isActive && wasActive) {
      void animate(
        stateScope.current,
        { boxShadow: '0 0 0 0 transparent' },
        { duration: 0.15 },
      );
    }
  }, [
    selected,
    highlighted,
    prevSelected,
    prevHighlighted,
    stateScope,
    animate,
  ]);

  const nodeContent = (
    <>
      {loading && <Loader2 className="animate-spin" size={24} />}
      {!loading && (
        <span ref={labelRef} className={fitSteps[stepIndex] ?? fitSteps[0]}>
          {label}
        </span>
      )}
    </>
  );

  const button = (
    <motion.button
      {...buttonProps}
      tabIndex={focusable ? buttonProps.tabIndex : (buttonProps.tabIndex ?? -1)}
      ref={useMergeRefs({ ref, scope })}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      // An external drag system (useDragSource) declares its own grabbed
      // state; otherwise the recognizer's drag is the node being moved.
      aria-grabbed={grabbed ?? (dragEnabled ? isDragging : undefined)}
      aria-pressed={
        // A host whose taps don't arrive as `onClick` — a canvas node driving
        // selection from pointer events — can declare the toggle state itself,
        // which is otherwise unknowable from here. The role guard still
        // applies: `aria-pressed` is invalid on roles that don't support it.
        supportsAriaPressed
          ? (buttonProps['aria-pressed'] ??
            (hasClickHandler ? selected : undefined))
          : undefined
      }
      className={nodeVariants({
        size,
        shape,
        color,
        disabled,
        className,
      })}
      style={{
        ...nodeProps.style,
        // A draggable node must not let the browser claim its movement for
        // scrolling; everything else keeps fast-tap handling.
        ...(dragEnabled && { touchAction: 'none' as const }),
        ...style,
        cursor,
      }}
      data-node-dragging={isDragging || undefined}
      data-node-selected={selected || undefined}
      data-node-linking={linking || undefined}
      data-node-highlighted={highlighted || undefined}
      onPointerDown={composeEventHandlers(
        composeEventHandlers(nodeProps.onPointerDown, handlePointerDown),
        externalPointerDown,
      )}
      onPointerUp={composeEventHandlers(
        nodeProps.onPointerUp,
        externalPointerUp,
      )}
      onPointerCancel={nodeProps.onPointerCancel}
      onPointerLeave={nodeProps.onPointerLeave}
      onKeyDown={composeEventHandlers(externalKeyDown, nodeProps.onKeyDown)}
      onKeyUp={composeEventHandlers(externalKeyUp, nodeProps.onKeyUp)}
      onClick={handleClick}
    >
      {/* Shape layer - carries the background, state box-shadows, and (for
          diamonds) the rotation, keeping the root element transform-free */}
      <span
        ref={stateScope}
        className={shapeLayerVariants({ shape })}
        aria-hidden
      >
        {/* Linking indicator - separate element so it can animate independently */}
        <AnimatePresence>
          {linking && (
            <motion.span
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              initial={{
                boxShadow: '0 0 0 0.08em var(--selected)',
              }}
              animate={{
                boxShadow: [
                  '0 0 0 0.08em var(--selected)',
                  '0 0 0 0.7em var(--selected)',
                ],
              }}
              exit={{ opacity: 0, boxShadow: '0 0 0 0 var(--selected)' }}
              transition={{
                boxShadow: {
                  duration: 0.4,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: 'reverse',
                  ease: [0.2, 0, 0.6, 1],
                },
              }}
              aria-hidden
            />
          )}
        </AnimatePresence>
        {/* Hold indicator - fills the shape over the remainder of the hold so
            the press visibly leads somewhere. Lives in the shape layer, so it
            follows the diamond's rotation rather than the button's box. */}
        <AnimatePresence>
          {isHolding && (
            <motion.span
              data-node-holding
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white/25"
              initial={skipAnimations ? false : { scale: 0.2, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: feedbackDuration / 1000, ease: 'linear' }}
              aria-hidden
            />
          )}
        </AnimatePresence>
      </span>
      {/* Content layer - positioned so it paints above the shape layer, and
          the fixed-size box the label is fitted to */}
      <span
        ref={labelBoxRef}
        className="relative flex size-full min-w-0 items-center justify-center overflow-hidden rounded-[inherit]"
      >
        {nodeContent}
        {props.children}
      </span>
    </motion.button>
  );

  return (
    <Tooltip
      open={labelRevealed}
      onOpenChange={(open, { reason }) => {
        // Hover must not reveal the label: on a canvas the pointer crosses
        // nodes constantly while positioning them, and popups appearing under
        // it would fight the gesture. Keyboard focus is allowed through as the
        // untimed equivalent of the hold.
        if (open && reason === 'trigger-hover') return;
        if (open && !canRevealLabel) return;
        setLabelRevealed(open);
      }}
    >
      <TooltipTrigger
        // The hold is the delay, and the click that ends it is already
        // withdrawn — leaving Base UI's own hover delay and close-on-click in
        // place would make the label arrive late and then vanish.
        delay={0}
        closeOnClick={false}
        render={button}
      />
      <TooltipContent
        // The full label is already the button's accessible name, so announcing
        // the popup as well would read it twice.
        aria-hidden="true"
        pointerEvents="none"
        className="wrap-anywhere whitespace-pre-line"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
