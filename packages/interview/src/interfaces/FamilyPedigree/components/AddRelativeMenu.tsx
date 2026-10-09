'use client';

import { Toolbar } from '@base-ui/react/toolbar';
import {
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import { type Ref, useLayoutEffect, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { MotionButton } from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { formatRelativeTerm } from '../kinship';
import { messages } from '../messages';
import type { Relation } from '../model';
import { usePedigreeWords } from '../pedigreeWords';

/** The least size of a button on screen, in pixels, however far the family
 * is zoomed out: above the 24 pixel minimum target size. */
const MIN_TARGET = 28;

type AddRelativeMenuProps = {
  isYou: boolean;
  name: string;
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
// the wrapper's padding, so it grows with the button. (`AddMenuReachProbe`
// measures the same size and gap.)
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
 * How far the add menu reaches out from a person's symbol, given its probe:
 * so many content units at any zoom, and never less on screen than the
 * buttons' least size allows.
 */
export function addMenuReach(probe: HTMLElement | null) {
  if (!probe || probe.clientWidth === 0) return { content: 0, screen: 0 };
  const content = probe.offsetHeight;
  return { content, screen: (content * MIN_TARGET) / probe.clientWidth };
}

/**
 * An invisible box as tall as a button and its gap from the symbol, and as
 * wide as a button, for `addMenuReach` to measure before any menu is shown.
 */
export function AddMenuReachProbe({ ref }: { ref: Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none invisible absolute top-0 left-0 box-content size-18 pb-4"
    />
  );
}

/**
 * The menu revealed around the selected family member. A Base UI toolbar, so
 * it is a single tab stop after the person's symbol with arrow keys moving
 * between its buttons. Zoomed out, the buttons stop shrinking at a size that
 * can still be pressed.
 */
export default function AddRelativeMenu({
  isYou,
  name,
  onAdd,
  scale,
}: AddRelativeMenuProps) {
  const intl = useAppIntl();
  const words = usePedigreeWords();
  const reduceMotion = useReducedMotion();

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
  }, [scale, counterScale]);

  return (
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
                  // No Button colour fills with one colour and hovers to
                  // another: the text colour at rest, primary on hover. The
                  // fill changes at once, so the hover does not read as lag.
                  'bg-text text-background ui-enabled:hover:bg-primary ui-enabled:hover:text-primary-contrast',
                  'transition-[box-shadow,opacity,translate]',
                )}
              />
            }
          >
            {formatRelativeTerm(item.relation, words)}
          </Toolbar.Button>
        </motion.div>
      ))}
    </Toolbar.Root>
  );
}
