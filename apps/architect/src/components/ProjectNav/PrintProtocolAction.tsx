import { Printer } from 'lucide-react';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  defineToolbarChild,
  ToolbarButton,
  type ToolbarButtonProps,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { getProtocolName } from '~/selectors/protocol';
const messages = defineMessages({
  print: {
    id: 'architect.projectNav.printProtocolAction.print',
    defaultMessage: 'Print',
    description:
      'Visible text in components / ProjectNav / PrintProtocolAction.',
  },
});

const dateWithSafeChars = (date: string, replaceWith = '-') =>
  date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

// Strip characters that are invalid in filenames on common platforms, keeping
// the name otherwise readable (case and spacing preserved).
const fileNameWithSafeChars = (name: string) =>
  name.replace(/[/\\:*?"<>|]/g, '-').trim();

type PrintProtocolActionProps = {
  ref?: ToolbarButtonProps['ref'];
};

export const PrintProtocolAction = defineToolbarChild(
  function PrintProtocolAction({ ref }: PrintProtocolActionProps) {
    const intl = useAppIntl();
    const protocolName = useSelector(getProtocolName);

    const handlePrint = useCallback(() => {
      if (!protocolName) return;
      const now = new Date();
      const dateString = dateWithSafeChars(
        intl.formatDate(now, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
        '-',
      );
      const fileName =
        fileNameWithSafeChars(
          intl.formatMessage(extraMessages.filename, {
            name: protocolName,
            date: dateString,
          }),
        ) + '.pdf';
      const previousTitle = window.document.title;
      window.document.title = fileName;
      try {
        window.print();
      } finally {
        window.document.title = previousTitle;
      }
    }, [protocolName, intl]);

    return (
      <ToolbarButton ref={ref} icon={<Printer />} onClick={handlePrint}>
        {intl.formatMessage(messages.print)}
      </ToolbarButton>
    );
  },
);

const extraMessages = defineMessages({
  filename: {
    id: 'architect.summary.print.filename',
    defaultMessage: '{name} Protocol Summary (Created {date})',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
