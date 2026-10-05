'use client';

import { Toolbar } from '@base-ui/react/toolbar';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pencil,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { messages } from '../messages';
import type { Relation } from '../model';

type AddRelativeMenuProps = {
  isYou: boolean;
  name: string;
  onAdd: (relation: Relation) => void;
  onEdit: () => void;
};

type MenuItem = {
  key: Relation | 'edit';
  label: MessageDescriptor;
  icon: ReactNode;
  /** Where the button sits around the person's symbol. */
  placement: string;
};

// Buttons sit on the side of the symbol where the new relative will appear:
// parents above, children below, siblings beside to the left and partners to
// the right. Their DOM order is the arrow-key order of the toolbar.
const ITEMS: MenuItem[] = [
  {
    key: 'parent',
    label: messages.addParent,
    icon: <ArrowUp className="size-4" aria-hidden />,
    placement: 'bottom-full left-1/2 mb-3 -translate-x-1/2',
  },
  {
    key: 'sibling',
    label: messages.addSibling,
    icon: <ArrowLeft className="size-4" aria-hidden />,
    placement: 'right-full top-1/2 mr-3 -translate-y-1/2',
  },
  {
    key: 'partner',
    label: messages.addPartner,
    icon: <ArrowRight className="size-4" aria-hidden />,
    placement: 'left-full top-1/2 ml-3 -translate-y-1/2',
  },
  {
    key: 'child',
    label: messages.addChild,
    icon: <ArrowDown className="size-4" aria-hidden />,
    // Below the name and sex annotation beneath the symbol.
    placement: 'top-full left-1/2 mt-16 -translate-x-1/2',
  },
  {
    key: 'edit',
    label: messages.editDetails,
    icon: <Pencil className="size-4" aria-hidden />,
    placement: 'bottom-full left-full -mb-2 ml-1',
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
  onEdit,
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
          key={item.key}
          onClick={() => (item.key === 'edit' ? onEdit() : onAdd(item.key))}
          data-testid={`pedigree-menu-${item.key}`}
          render={
            <motion.button
              type="button"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
                delay: reduceMotion ? 0 : index * 0.02,
              }}
              className={cx(
                'focusable pointer-events-auto absolute flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap',
                'bg-surface-1 text-text elevation-medium hover:bg-primary hover:text-primary-contrast',
                item.placement,
              )}
            />
          }
        >
          {item.icon}
          <AppMessage message={item.label} />
        </Toolbar.Button>
      ))}
    </Toolbar.Root>
  );
}
