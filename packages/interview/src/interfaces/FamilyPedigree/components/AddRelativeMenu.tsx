'use client';

import { Toolbar } from '@base-ui/react/toolbar';
import { motion, useReducedMotion } from 'motion/react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { messages } from '../messages';
import type { Relation } from '../model';

type AddRelativeMenuProps = {
  isYou: boolean;
  name: string;
  onAdd: (relation: Relation) => void;
};

type MenuItem = {
  relation: Relation;
  label: MessageDescriptor;
  /** Where the button sits around the person's symbol. */
  placement: string;
};

// Buttons sit on the side of the symbol where the new relative will appear:
// parents above, children below, siblings to the left and partners to the
// right. Their DOM order is the arrow-key order of the toolbar.
const ITEMS: MenuItem[] = [
  {
    relation: 'parent',
    label: messages.addParent,
    placement: 'bottom-full left-1/2 mb-4 -translate-x-1/2',
  },
  {
    relation: 'sibling',
    label: messages.addSibling,
    placement: 'right-full top-1/2 mr-4 -translate-y-1/2',
  },
  {
    relation: 'partner',
    label: messages.addPartner,
    placement: 'left-full top-1/2 ml-4 -translate-y-1/2',
  },
  {
    relation: 'child',
    label: messages.addChild,
    placement: 'top-full left-1/2 mt-4 -translate-x-1/2',
  },
];

/**
 * The menu revealed around the selected family member. A Base UI toolbar, so
 * it is a single tab stop after the person's symbol with arrow keys moving
 * between its buttons.
 */
export default function AddRelativeMenu({
  isYou,
  name,
  onAdd,
}: AddRelativeMenuProps) {
  const intl = useAppIntl();
  const reduceMotion = useReducedMotion();

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
        <Toolbar.Button
          key={item.relation}
          onClick={() => onAdd(item.relation)}
          data-testid={`pedigree-menu-${item.relation}`}
          render={
            <motion.button
              type="button"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
                delay: reduceMotion ? 0 : index * 0.02,
              }}
              className={cx(
                'focusable pointer-events-auto absolute flex size-18 items-center justify-center rounded-full text-sm font-semibold',
                'bg-surface-1 text-text elevation-medium hover:bg-primary hover:text-primary-contrast',
                item.placement,
              )}
            />
          }
        >
          <AppMessage message={item.label} />
        </Toolbar.Button>
      ))}
    </Toolbar.Root>
  );
}
