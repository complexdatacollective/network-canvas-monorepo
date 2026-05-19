import { Printer } from 'lucide-react';
import { useSelector } from 'react-redux';

import Tooltip from '~/components/NewComponents/Tooltip';
import { Button } from '~/lib/legacy-ui/components';
import { getProtocolName } from '~/selectors/protocol';

const dateWithSafeChars = (date: string, replaceWith = '-') =>
  date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

const PrintProtocolAction = () => {
  const protocolName = useSelector(getProtocolName);

  const handlePrint = () => {
    if (!protocolName) return;
    const now = new Date();
    const dateString = `${dateWithSafeChars(now.toLocaleDateString(), '-')} ${dateWithSafeChars(now.toLocaleTimeString(), '.')}`;
    const fileName = `${protocolName} Protocol Summary (Created ${dateString}).pdf`;
    window.document.title = fileName;
    window.print();
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
