import { Settings2 } from 'lucide-react';
import {
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import {
  blockActionProps,
  firstSettingsControlIn,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { surfaceSpacingVariants } from '@codaco/fresco-ui/layout/Surface';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  type Box,
  COVERED_PROBE_STYLE,
  scrollerOf,
  SETTINGS_COLLISIONS,
  SETTINGS_OFFSET,
  useSettingsPlacement,
} from './assetBlocks/settingsPlacement.ts';

// The direction text runs in where an element sits: what the nearest `dir`
// says, or what the browser worked out where that says `auto`.
export const directionAt = (element: Element): 'ltr' | 'rtl' => {
  const stated = element.closest('[dir]')?.getAttribute('dir');
  if (stated === 'rtl' || stated === 'ltr') return stated;
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
};

// Whether `target` is one of the controls of the block whose settings button
// is `button` (`assetBlockControlsProps`), drawn in its view.
const isOwnControl = (
  button: HTMLElement | null,
  target: EventTarget | null,
): boolean => {
  if (button === null || !(target instanceof Element)) return false;
  const view = button.closest('[data-node-view-wrapper]');
  return (
    view !== null &&
    view.contains(target) &&
    target.closest('[data-asset-block-controls]') !== null
  );
};

// Whether `target` is in the settings whose panel is `panel`, or is their
// button.
const isInSettings = (
  panel: HTMLElement | null,
  button: HTMLElement | null,
  target: EventTarget | null,
): boolean => {
  // Focus on nothing in particular: the page's own Escape.
  if (!(target instanceof Node) || target === target.ownerDocument?.body) {
    return true;
  }
  const popup = panel?.closest('[role="dialog"]') ?? panel;
  return (
    (popup?.contains(target) ?? false) || (button?.contains(target) ?? false)
  );
};

type BlockSettingsPopoverProps = Readonly<{
  /**
   * The name of the button and of the settings, such as "Field settings".
   * Read only by a screen reader, so plain English.
   */
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selects the block: pressing its settings button does, as it opens them. */
  select: () => void;
  /** The parts of the block the settings never cover, read as they open. */
  keepOut?: () => readonly Box[];
  /**
   * Hidden, not closed, while something they opened is shown over them (a
   * resource browser, a dialog): what they opened belongs to them.
   */
  hidden?: boolean;
  /** Given the panel of the settings while they are drawn. */
  panelRef?: RefObject<HTMLElement | null>;
  /** Attributes for the settings' popup, for finding them. */
  popupProps?: Readonly<Record<`data-${string}`, string>>;
  children: ReactNode;
}>;

/**
 * The settings button of a block (in its tab, `BlockTab`) and the block's
 * settings, attached to the button. They open only from the button (or Enter
 * on the selected block, which presses it), on the first side of the button
 * where they fit (`settingsPlacement`), never covering the parts of the block
 * in `keepOut`. Opening them selects the block and moves focus to their first
 * control; Escape closes them and gives focus back to the button.
 */
export function BlockSettingsPopover({
  name,
  open,
  onOpenChange,
  select,
  keepOut,
  hidden = false,
  panelRef,
  popupProps,
  children,
}: BlockSettingsPopoverProps) {
  const nameId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const coveredRef = useRef<HTMLSpanElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // Read at the button as the settings open: the page they keep inside, and
  // the direction of the block's text, whose end the button is at.
  const [scroller, setScroller] = useState<Element | undefined>(undefined);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!open || button === null) return;
    setScroller(scrollerOf(button));
    setDirection(directionAt(button));
  }, [open]);
  const placement = useSettingsPlacement({
    open: open && !hidden,
    buttonRef,
    panel,
    scroller,
    probeRef: coveredRef,
    ...(keepOut !== undefined && { keepOut }),
    direction,
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        // What the settings opened is shown over them, and in use: a press
        // in it is not a press outside them, and Escape in it closes only
        // it. They close as it does, where they must.
        if (!next && hidden) return;
        // Nor is a press on the block's own controls, which the settings
        // leave uncovered for that: the corner that resizes a picture, a
        // player's controls.
        if (
          !next &&
          details.reason === 'outside-press' &&
          isOwnControl(buttonRef.current, details.event.target)
        ) {
          return;
        }
        // Escape closes only the popup that focus is in: a list that a
        // setting opened over the page closes, and the settings stay.
        if (
          !next &&
          details.reason === 'escape-key' &&
          !isInSettings(panel, buttonRef.current, details.event.target)
        ) {
          return;
        }
        if (next) select();
        onOpenChange(next);
      }}
    >
      <PopoverTrigger
        ref={buttonRef}
        nativeButton
        render={
          <IconButton
            size="sm"
            variant="text"
            aria-label={name}
            icon={<Settings2 aria-hidden />}
          />
        }
        {...blockActionProps}
      />
      <span
        ref={coveredRef}
        aria-hidden
        className="invisible absolute size-0"
        style={COVERED_PROBE_STYLE}
      />
      <PopoverContent
        side={placement.side}
        align={placement.align}
        sideOffset={SETTINGS_OFFSET}
        collisionAvoidance={SETTINGS_COLLISIONS}
        collisionPadding={placement.clearance}
        collisionBoundary={scroller}
        aria-labelledby={nameId}
        initialFocus={() =>
          panel === null ? true : (firstSettingsControlIn(panel) ?? true)
        }
        // No taller than the room left clear of the window's edges, and
        // scrolled within, so that every setting can be reached in a short
        // window.
        spacing="none"
        className={cx(
          'max-h-(--available-height) flex-col',
          hidden ? 'hidden' : 'flex',
        )}
        showArrow={!hidden}
        data-block-settings=""
        data-scrolls={placement.scrolls || undefined}
        {...popupProps}
      >
        <span id={nameId} className="sr-only" lang="en">
          {name}
        </span>
        <ScrollArea
          ref={(drawn: HTMLElement | null) => {
            setPanel(drawn);
            if (panelRef !== undefined) panelRef.current = drawn;
          }}
          className="min-h-0"
          // Not a stop of its own: every setting in it can be reached, and
          // is scrolled to as it is.
          tabIndex={-1}
          // A control scrolled to as it takes focus comes clear of the edge
          // it was hidden behind, and of the fade drawn there.
          viewportClassName={cx(
            surfaceSpacingVariants({ spacing: 'sm' }),
            'scroll-py-6',
          )}
        >
          {children}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
