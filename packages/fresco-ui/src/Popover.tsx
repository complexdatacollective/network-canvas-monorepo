'use client';

import { Popover as BasePopover } from '@base-ui/react/popover';
import { AnimatePresence, motion, type MotionProps } from 'motion/react';
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  cloneElement,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useId,
  useState,
} from 'react';

import Surface, { type SurfaceVariants } from './layout/Surface';
import {
  POPOVER_ARROW_CLASS_NAME,
  POPOVER_ARROW_PADDING,
  type PopupSide,
  usePhysicalSide,
} from './popoverArrow';
import { usePortalContainer } from './PortalContainer';
import { cx } from './utils/cva';

const popupAnimations = {
  spring: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { type: 'spring', duration: 0.5 },
  },
  enter: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    transition: { type: 'spring', duration: 0.5 },
  },
  none: {},
} satisfies Record<string, MotionProps>;

type BaseUISharedPopoverContainerProps = Omit<
  ComponentPropsWithoutRef<typeof motion.div>,
  'className' | 'children'
> & {
  /** The popup's Base UI arrow, if it has one. */
  arrow?: ReactNode;
  /** Classes for the surface the content sits on. */
  className?: string;
  spacing?: SurfaceVariants['spacing'];
  shadow?: SurfaceVariants['shadow'];
  /**
   * `enter` animates in but closes at once, for popups that must not linger
   * while a newer one opens; `none` does not animate.
   */
  animation?: keyof typeof popupAnimations;
  children?: ReactNode;
};

/**
 * What a Base UI popup renders as: an unstyled layer that Base UI positions
 * and that carries the arrow, around a `Surface` holding the content.
 *
 * The arrow overhangs the popup's edge, so it sits outside the `Surface`.
 * That leaves the `Surface` clipping its content to its rounded corners like
 * every other `Surface`; anything drawn against its edge, such as a scroll
 * fade or a highlighted row, stays inside the curve.
 */
export function BaseUISharedPopoverContainer({
  arrow,
  className,
  spacing = 'xs',
  shadow = 'md',
  animation = 'spring',
  children,
  ...layerProps
}: BaseUISharedPopoverContainerProps) {
  return (
    <motion.div
      {...popupAnimations[animation]}
      {...layerProps}
      // Base UI focuses this layer, so it shares the surface's corners for the
      // focus outline to follow them.
      className="relative rounded"
    >
      <Surface
        floating
        noContainer
        spacing={spacing}
        shadow={shadow}
        className={cx('max-w-(--available-width)', className)}
      >
        {children}
      </Surface>
      {/* After the surface, so the arrow paints over its border. */}
      {arrow}
    </motion.div>
  );
}

type PopoverContextValue = {
  mounted: boolean;
  setMounted: (mounted: boolean) => void;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const context = useContext(PopoverContext);
  if (!context) {
    throw new Error('Popover components must be used within a Popover');
  }
  return context;
}

type PopoverProps = ComponentProps<typeof BasePopover.Root> & {
  children: ReactNode;
};

function Popover({
  children,
  defaultOpen = false,
  onOpenChange,
  open,
  ...props
}: PopoverProps) {
  const [mounted, setMounted] = useState(defaultOpen);

  const controlled = open !== undefined;

  const handleOpenChange = (
    nextOpen: boolean,
    event: BasePopover.Root.ChangeEventDetails,
  ) => {
    // The consumer runs first so a `event.cancel()` (e.g. a sticky popover
    // swallowing an outside press) also vetoes this internal mounted mirror —
    // otherwise an uncontrolled popover closes even though Base UI honoured
    // the cancellation.
    onOpenChange?.(nextOpen, event);
    if (!event.isCanceled) setMounted(nextOpen);
  };

  // When open is controlled externally, sync mounted state so
  // PopoverContent renders. base-ui only fires onOpenChange for
  // internal state changes, not when the open prop changes.
  const effectiveOpen = controlled ? open : mounted;
  const effectiveMounted = effectiveOpen;

  return (
    <PopoverContext.Provider value={{ mounted: effectiveMounted, setMounted }}>
      <BasePopover.Root
        {...props}
        open={effectiveOpen}
        onOpenChange={handleOpenChange}
      >
        {children}
      </BasePopover.Root>
    </PopoverContext.Provider>
  );
}

type PopoverTriggerProps = ComponentProps<typeof BasePopover.Trigger> & {
  asChild?: boolean;
};

const isRecordLike = (
  value: unknown,
): value is { displayName?: unknown; name?: unknown } =>
  (typeof value === 'object' || typeof value === 'function') && value !== null;

function isButtonElement(element: React.ReactElement): boolean {
  if (typeof element.type === 'string') {
    return element.type === 'button';
  }
  // Exotic components (memo, forwardRef) are objects at runtime, so read the
  // name properties defensively rather than trusting the declared type.
  const type: unknown = element.type;
  const displayName =
    isRecordLike(type) && typeof type.displayName === 'string'
      ? type.displayName
      : undefined;
  const name =
    isRecordLike(type) && typeof type.name === 'string' ? type.name : '';
  return /button/i.test(displayName ?? name);
}

function PopoverTrigger({
  children,
  asChild,
  nativeButton,
  ...props
}: PopoverTriggerProps) {
  if (asChild && isValidElement<Record<string, unknown>>(children)) {
    // A NAMED FUNCTION EXPRESSION with a lowercase name. Base UI's
    // `warnIfRenderPropLooksLikeComponent` reads `renderFn.name` and
    // warns if the first character is uppercase — to catch people
    // accidentally writing `render={Component}`. An arrow function
    // assigned to `const renderTrigger` inside the `PopoverTrigger`
    // function ends up with a compound `.name` like
    // `PopoverTrigger[renderTrigger]` (depending on the JS engine /
    // Turbopack's function-naming), which starts with `P` and trips
    // the warning. A named function expression forces the `.name`
    // unconditionally, regardless of enclosing scope.
    const renderTriggerFn = function renderTrigger(
      triggerProps: React.HTMLAttributes<Element> & {
        ref?: React.Ref<Element>;
      },
    ) {
      return cloneElement(children, {
        ...triggerProps,
        ...children.props,
      } as Parameters<typeof cloneElement>[1]);
    };

    return (
      <BasePopover.Trigger
        nativeButton={nativeButton ?? isButtonElement(children)}
        render={renderTriggerFn}
        {...props}
      />
    );
  }

  return (
    <BasePopover.Trigger nativeButton={nativeButton} {...props}>
      {children}
    </BasePopover.Trigger>
  );
}

type PopoverContentProps = Omit<
  ComponentProps<typeof BasePopover.Popup>,
  'className'
> & {
  className?: string;
  children: ReactNode;
  side?: PopupSide;
  sideOffset?: number;
  showArrow?: boolean;
  keepMounted?: boolean;
  align?: 'start' | 'center' | 'end';
  anchor?: Element | React.RefObject<Element | null> | null;
  /**
   * Padding around the content. The default suits prose and forms; a popup
   * that holds a list of options takes `xs`, as menus and comboboxes do.
   */
  spacing?: SurfaceVariants['spacing'];
};

function PopoverContent({
  children,
  side,
  sideOffset = 10,
  showArrow = true,
  keepMounted = true,
  className,
  align = 'center',
  anchor,
  spacing = 'md',
  ...props
}: PopoverContentProps) {
  const { mounted } = usePopoverContext();
  const portalContainer = usePortalContainer();
  const physicalSide = usePhysicalSide(side);

  return (
    <BasePopover.Portal
      container={portalContainer ?? undefined}
      keepMounted={keepMounted}
    >
      <AnimatePresence>
        {mounted && (
          <BasePopover.Positioner
            className="z-3000"
            sideOffset={sideOffset}
            arrowPadding={POPOVER_ARROW_PADDING}
            align={align}
            {...(physicalSide ? { side: physicalSide } : {})}
            {...(anchor ? { anchor } : {})}
          >
            <BasePopover.Popup
              render={
                <BaseUISharedPopoverContainer
                  className={className}
                  spacing={spacing}
                  arrow={
                    showArrow && (
                      <BasePopover.Arrow className={POPOVER_ARROW_CLASS_NAME}>
                        <ArrowSvg />
                      </BasePopover.Arrow>
                    )
                  }
                />
              }
              {...props}
            >
              {children}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        )}
      </AnimatePresence>
    </BasePopover.Portal>
  );
}

/**
 * The popup's heading. Base UI points the popup's `aria-labelledby` at it, so
 * placing one inside `PopoverContent` is what gives the popup (a
 * `role="dialog"`) its accessible name.
 *
 * Every `PopoverContent` needs a name from one of three places: a
 * `PopoverTitle`, an `aria-label`, or an `aria-labelledby` passed to
 * `PopoverContent` itself. Use `render` to draw the title as a `Heading`.
 */
function PopoverTitle(props: ComponentProps<typeof BasePopover.Title>) {
  return <BasePopover.Title {...props} />;
}

export function ArrowSvg(props: ComponentProps<'svg'>) {
  // Each arrow needs its own clip; useId's punctuation is not safe in `url()`.
  const clipId = `popover-arrow-${useId().replace(/[^\w-]/g, '')}`;
  return (
    // Drawn at 1:1, so the viewBox is in pixels. A 14px point whose legs run
    // straight into the border, with no flat shoulders: the arrow has to fit
    // between a popup's rounded corners, and a one-line tooltip beside its
    // trigger can be a full pill with no straight border at all. y=8 is the
    // border's centre line and y=9 its inner edge. The legs cross y=8 at x=1
    // and x=15 and carry on, and the clip cuts the outline off along y=9: on a
    // straight border the legs end flush with its inner edge, and where the
    // border has already curved a pixel or so inward they still reach it
    // instead of stopping short. The fill covers the border between the legs.
    // The viewBox runs 2px wider than the point either side so the legs'
    // outer edges are not cut off. A size that differs from the viewBox
    // invalidates POPOVER_ARROW_CLASS_NAME's offsets.
    <svg
      aria-hidden="true"
      width="20"
      height="10"
      viewBox="-2 0 20 10"
      fill="none"
      {...props}
    >
      <clipPath id={clipId}>
        <rect x="-2" y="0" width="20" height="9" />
      </clipPath>
      <path
        d="M-0.89 10L6.88 1.78Q8 0.6 9.12 1.78L16.89 10Z"
        className="fill-surface-popover"
      />
      <path
        d="M-0.89 10L6.88 1.78Q8 0.6 9.12 1.78L16.89 10"
        className="stroke-outline"
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
}

export { Popover, PopoverContent, PopoverTitle, PopoverTrigger };
