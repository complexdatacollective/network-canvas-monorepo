'use client';

import { FileUp, Trash } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';

const messages = defineMessages({
  selected: {
    id: 'fresco.InterviewsTable.InterviewsSelectionBar.selected',
    defaultMessage: '{value1, plural, one {# selected} other {# selected}}',
    description:
      'Count of selected rows, shown in the floating bar at the bottom of the Interviews table once rows are selected. value1 is the number of selected interviews.',
  },
  selectAll: {
    id: 'fresco.InterviewsTable.InterviewsSelectionBar.selectAll',
    defaultMessage: 'Select all {value1, number}',
    description:
      'Text button in the floating selection bar of the Interviews table, shown when only some rows are selected; selects every interview matching the current filters. value1 is the total number of interviews.',
  },
  deleteSelected: {
    id: 'fresco.InterviewsTable.InterviewsSelectionBar.deleteSelected',
    defaultMessage: 'Delete Selected',
    description:
      'Button in the floating selection bar of the Interviews table; starts deleting the selected interviews (trash icon, destructive colour).',
  },
  exportSelected: {
    id: 'fresco.InterviewsTable.InterviewsSelectionBar.exportSelected',
    defaultMessage: 'Export Selected',
    description:
      'Button in the floating selection bar of the Interviews table; starts exporting the interview data of the selected interviews (verb, not a noun).',
  },
  deselectAll: {
    id: 'fresco.InterviewsTable.InterviewsSelectionBar.deselectAll',
    defaultMessage: 'Deselect all',
    description:
      'Accessible name of the close (X) button in the selection bar of the Interviews table; clears the selection. Read only by screen readers.',
  },
});

type InterviewsSelectionBarProps = {
  selectedCount: number;
  totalCount: number;
  isBusy: boolean;
  onSelectAllMatching: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
  onExportSelected: () => void;
};

export const InterviewsSelectionBar = ({
  selectedCount,
  totalCount,
  isBusy,
  onSelectAllMatching,
  onDeselectAll,
  onDeleteSelected,
  onExportSelected,
}: InterviewsSelectionBarProps) => {
  const intl = useAppIntl();

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <MotionSurface
          floating
          spacing="sm"
          shadow="md"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
          className={cx(
            'fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit flex-wrap items-center justify-center gap-4 rounded',
          )}
          noContainer
        >
          <Paragraph className="shrink-0 grow" margin="none">
            {intl.formatMessage(messages.selected, { value1: selectedCount })}
          </Paragraph>
          {selectedCount < totalCount && (
            <Button
              variant="text"
              onClick={onSelectAllMatching}
              disabled={isBusy}
            >
              {intl.formatMessage(messages.selectAll, { value1: totalCount })}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              onClick={onDeleteSelected}
              color="destructive"
              disabled={isBusy}
              icon={<Trash className="size-4" />}
            >
              {intl.formatMessage(messages.deleteSelected)}
            </Button>
            <Button
              onClick={onExportSelected}
              disabled={isBusy}
              icon={<FileUp className="size-4" />}
            >
              {intl.formatMessage(messages.exportSelected)}
            </Button>
          </div>
          <CloseButton
            className="grow"
            onClick={onDeselectAll}
            aria-label={intl.formatMessage(messages.deselectAll)}
          />
        </MotionSurface>
      )}
    </AnimatePresence>
  );
};
