import { Copy } from 'lucide-react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import { useAppSelector } from '~/ducks/hooks';
import { getProtocolOpenElsewhere } from '~/ducks/modules/app';

// Shown across the protocol editor when the same protocol is already open in
// another tab. Both tabs share one library row, so only the first tab edits it;
// this tab is a read-only view (autosave is disabled). Non-blocking so the user
// can still read the protocol, with a clear way back to the start screen.
const ProtocolOpenElsewhereBanner = () => {
  const [, setLocation] = useLocation();
  const openElsewhere = useAppSelector(getProtocolOpenElsewhere);

  if (!openElsewhere) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-warning/20 text-text flex items-center justify-between gap-5 px-7 py-2.5 text-sm"
    >
      <span className="flex items-center gap-2.5">
        <Copy className="size-4 shrink-0" aria-hidden />
        This protocol is already open in another tab. To avoid conflicting
        edits, changes here won&apos;t be saved. Continue editing in the other
        tab, or return to the start screen.
      </span>
      <Button size="sm" color="primary" onClick={() => setLocation('/')}>
        Return to start screen
      </Button>
    </div>
  );
};

export default ProtocolOpenElsewhereBanner;
