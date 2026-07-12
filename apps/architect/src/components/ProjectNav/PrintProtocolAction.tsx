import { Printer } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';
import { getProtocolName } from '~/selectors/protocol';

const dateWithSafeChars = (date: string, replaceWith = '-') =>
  date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

// Strip characters that are invalid in filenames on common platforms, keeping
// the name otherwise readable (case and spacing preserved).
const fileNameWithSafeChars = (name: string) =>
  name.replace(/[/\\:*?"<>|]/g, '-').trim();

export function usePrintProtocolAction(): ToolbarSegment {
  const protocolName = useSelector(getProtocolName);

  const handlePrint = useCallback(() => {
    if (!protocolName) return;
    const now = new Date();
    const dateString = `${dateWithSafeChars(now.toLocaleDateString(), '-')} ${dateWithSafeChars(now.toLocaleTimeString(), '.')}`;
    const fileName = `${fileNameWithSafeChars(protocolName)} Protocol Summary (Created ${dateString}).pdf`;
    const previousTitle = window.document.title;
    window.document.title = fileName;
    try {
      window.print();
    } finally {
      window.document.title = previousTitle;
    }
  }, [protocolName]);

  return useMemo<ToolbarSegment>(
    () => ({
      type: 'button',
      id: 'print',
      label: 'Print',
      icon: <Printer />,
      showLabel: true,
      onClick: handlePrint,
    }),
    [handlePrint],
  );
}
