import { Printer } from 'lucide-react';
import { useSelector } from 'react-redux';

import Tooltip from '~/components/NewComponents/Tooltip';
import { Button } from '~/lib/legacy-ui/components';
import { getProtocolName } from '~/selectors/protocol';

const dateWithSafeChars = (date: string, replaceWith = '-') =>
  date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

// Strip characters that are invalid in filenames on common platforms, keeping
// the name otherwise readable (case and spacing preserved).
const fileNameWithSafeChars = (name: string) =>
  name.replace(/[/\\:*?"<>|]/g, '-').trim();

const PrintProtocolAction = () => {
  const protocolName = useSelector(getProtocolName);

  const handlePrint = () => {
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
  };

  return (
    <Tooltip content="Print protocol summary">
      <Button onClick={handlePrint} color="neon-coral" icon={<Printer />}>
        Print
      </Button>
    </Tooltip>
  );
};

export default PrintProtocolAction;
