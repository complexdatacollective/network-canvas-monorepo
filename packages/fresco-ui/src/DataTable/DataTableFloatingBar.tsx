'use client';

import { type Table } from '@tanstack/react-table';
import { AnimatePresence } from 'motion/react';
import { type ComponentProps } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import CloseButton from '../CloseButton';
import { MotionSurface } from '../layout/Surface';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';

const messages = defineMessages({
  rowsSelected: {
    id: 'frescoUi.dataTableFloatingBar.rowsSelected',
    defaultMessage:
      '{count, plural, one {# row selected} other {# rows selected}}',
    description:
      'Selection summary shown in the floating action bar above a table.',
  },
  closeSelectionBar: {
    id: 'frescoUi.dataTableFloatingBar.close',
    defaultMessage: 'Close selection bar',
    description:
      'Accessible name of the button that clears the selection and dismisses the floating action bar.',
  },
});

type DataTableFloatingBarProps<TData> = {
  table: Table<TData>;
  className?: string;
} & Omit<ComponentProps<typeof MotionSurface>, 'table' | 'className'>;

export function DataTableFloatingBar<TData>({
  table,
  children,
  className,
  ...props
}: DataTableFloatingBarProps<TData>) {
  // TanStack Table returns a mutable ref with stable identity, defeating React Compiler memoization.
  'use no memo';
  const intl = useAppIntl();
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <MotionSurface
          key="floating-bar"
          floating
          spacing="sm"
          shadow="md"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
          className={cx(
            'fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit flex-wrap items-center justify-center gap-4 rounded',
            className,
          )}
          noContainer
          {...props}
        >
          <Paragraph className="shrink-0 grow" margin="none">
            {intl.formatMessage(messages.rowsSelected, {
              count: selectedCount,
            })}
          </Paragraph>
          <div className="flex gap-2">{children}</div>
          <CloseButton
            className="grow"
            onClick={() => table.toggleAllRowsSelected(false)}
            aria-label={intl.formatMessage(messages.closeSelectionBar)}
          />
        </MotionSurface>
      )}
    </AnimatePresence>
  );
}
