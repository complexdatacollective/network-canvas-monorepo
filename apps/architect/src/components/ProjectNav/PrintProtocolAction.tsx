import { Printer } from 'lucide-react';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages, withoutIsolates } from '@codaco/app-i18n/messages';
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
      'Label of the toolbar button on the Summary page that prints the protocol summary or saves it as a PDF. Print is a verb.',
  },
});

const dateWithSafeChars = (date: string, replaceWith = '-') =>
  date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

// Strip characters that are invalid in filenames on common platforms, and the
// invisible isolates a right-to-left interface puts around the protocol's
// name, keeping the name otherwise readable (case and spacing preserved).
const fileNameWithSafeChars = (name: string) =>
  withoutIsolates(name)
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim();

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
    description:
      'File name suggested when the protocol summary is saved as a PDF. name is the protocol name; date is the current date and time with punctuation replaced by hyphens. The extension is added separately.',
  },
});
