'use client';

import { Toolbar } from '@base-ui/react/toolbar';
import { type MotionValue, motion, useMotionValue } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useAppIntl } from '@codaco/app-i18n/react';
import { MotionButton } from '@codaco/fresco-ui/Button';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { formatRelativeTerm } from '../kinship';
import { messages } from '../messages';
import type { Relation } from '../model';
import { usePedigreeWords } from '../pedigreeWords';

/** The least size of a button on screen, in pixels, however far the family
 * is zoomed out: above the 24 pixel minimum target size. */
const MIN_TARGET = 28;

type AddRelativeMenuProps = {
  /** Who the menu is for, as `data-add-menu` names them. */
  personId: string;
  isYou: boolean;
  name: string;
  /** The element the menu is drawn in, over everything else on the stage. */
  layer: HTMLElement | null;
  /** The person's place in the family, which the menu is drawn around. */
  anchor: HTMLElement | null;
  onAdd: (relation: Relation) => void;
  /** The canvas's zoom, which the buttons are drawn at, down to a least
   * size. */
  scale: MotionValue<number>;
};

type MenuItem = {
  relation: Relation;
  /** Where the button sits around the person's symbol, the gap between
   * them, and the edge it grows from when kept from shrinking. */
  placement: string;
};

// Buttons sit on the side of the symbol where the new relative will appear:
// parents above, children below, siblings to the left and partners to the
// right. Their DOM order is the arrow-key order of the toolbar. The gap is
// the wrapper's padding, so it grows with the button.
const ITEMS: MenuItem[] = [
  {
    relation: 'parent',
    placement: 'bottom-full left-1/2 pb-4 -translate-x-1/2 origin-bottom',
  },
  {
    relation: 'sibling',
    placement: 'right-full top-1/2 pr-4 -translate-y-1/2 origin-right',
  },
  {
    relation: 'partner',
    placement: 'left-full top-1/2 pl-4 -translate-y-1/2 origin-left',
  },
  {
    relation: 'child',
    placement: 'top-full left-1/2 pt-4 -translate-x-1/2 origin-top',
  },
];

/**
 * The menu revealed around the selected family member. A Base UI toolbar, so
 * it is a single tab stop after the person's symbol with arrow keys moving
 * between its buttons. Zoomed out, the buttons stop shrinking at a size that
 * can still be pressed.
 *
 * It is drawn in `layer`, over the prompt, the toolbar and the rest of the
 * family, rather than inside the family: everything inside the family is
 * painted beneath what is drawn over the canvas. Each frame it is placed
 * over `anchor` as panning, zooming and the family's own layout move them.
 */
export default function AddRelativeMenu({
  personId,
  isYou,
  name,
  layer,
  anchor,
  onAdd,
  scale,
}: AddRelativeMenuProps) {
  const intl = useAppIntl();
  const words = usePedigreeWords();
  const reduceMotion = usePrefersReducedMotion();

  // How much each button is enlarged against the canvas's zoom.
  const counterScale = useMotionValue(1);
  const firstButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      const size = firstButton.current?.offsetWidth ?? 0;
      const current = scale.get();
      counterScale.set(
        size > 0 && current > 0
          ? Math.max(1, MIN_TARGET / (size * current))
          : 1,
      );
    };
    update();
    return scale.on('change', update);
  }, [scale, counterScale, layer, anchor]);

  // Drawn at the anchor's size and zoomed as it is, so the buttons sit
  // around the symbol exactly as they would inside the family.
  const placed = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = placed.current;
    if (!element || !layer || !anchor) return undefined;
    let frame = 0;
    let last = '';
    const place = () => {
      const width = anchor.offsetWidth;
      const height = anchor.offsetHeight;
      const box = anchor.getBoundingClientRect();
      const origin = layer.getBoundingClientRect();
      const zoom = width > 0 ? box.width / width : 1;
      const transform = `translate(${box.left - origin.left}px, ${box.top - origin.top}px) scale(${zoom})`;
      const next = `${width} ${height} ${transform}`;
      if (next !== last) {
        last = next;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.transform = transform;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [layer, anchor]);

  if (!layer || !anchor) return null;

  return createPortal(
    <div
      ref={placed}
      className="pointer-events-none absolute top-0 left-0 origin-top-left"
      data-add-menu={personId}
    >
      <Toolbar.Root
        aria-label={intl.formatMessage(messages.actionsLabel, {
          isYou: isYou ? 'true' : 'false',
          name,
        })}
        loopFocus
        className="pointer-events-none absolute inset-0"
      >
        {ITEMS.map((item, index) => (
          // Placed by a wrapper, so the button's own pressed nudge does not
          // replace the translate that centres it.
          <motion.div
            key={item.relation}
            className={cx('absolute', item.placement)}
            style={{ scale: counterScale }}
            data-add-menu-item
          >
            <Toolbar.Button
              ref={index === 0 ? firstButton : undefined}
              onClick={() => onAdd(item.relation)}
              data-testid={`pedigree-menu-${item.relation}`}
              render={
                <MotionButton
                  size="sm"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 30,
                    delay: reduceMotion ? 0 : index * 0.02,
                  }}
                  className={cx(
                    'pointer-events-auto size-18 max-w-none shrink-0 rounded-full p-0 whitespace-nowrap',
                    // Set apart from the family and the canvas beneath them
                    // by a soft, wide shadow, the same at rest, on hover and
                    // when pressed.
                    'shadow-[0_2px_10px_oklch(from_var(--background)_0.05_c_h/0.35),0_10px_40px_oklch(from_var(--background)_0.05_c_h/0.5)]!',
                    // No Button colour fills with one colour and hovers to
                    // another: the text colour at rest, primary on hover. The
                    // fill changes at once, so the hover does not read as lag.
                    'bg-text text-background ui-enabled:hover:bg-primary ui-enabled:hover:text-primary-contrast',
                    // Opacity is left to the entrance animation alone. Were it
                    // also a CSS transition, Safari and Firefox would fade the
                    // buttons in a second time, from transparent, when that
                    // animation hands its final opacity over to the style.
                    'transition-[box-shadow,translate]',
                  )}
                />
              }
            >
              {formatRelativeTerm(item.relation, words)}
            </Toolbar.Button>
          </motion.div>
        ))}
      </Toolbar.Root>
    </div>,
    layer,
  );
}
