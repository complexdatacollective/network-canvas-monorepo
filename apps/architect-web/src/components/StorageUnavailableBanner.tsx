import { TriangleAlert } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getStorageUnavailable } from '~/ducks/modules/app';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import { Button } from '~/lib/legacy-ui/components';

// Shown across the protocol editor when a protocol was opened from an in-memory
// copy because the browser's storage is unavailable (e.g. private browsing).
// Non-blocking: the user can keep editing, but their work won't persist, so we
// keep a download action close at hand.
const StorageUnavailableBanner = () => {
  const dispatch = useAppDispatch();
  const storageUnavailable = useAppSelector(getStorageUnavailable);

  if (!storageUnavailable) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-warning/20 text-foreground flex items-center justify-between gap-(--space-md) px-(--space-lg) py-(--space-sm) text-sm"
    >
      <span className="flex items-center gap-(--space-sm)">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        This protocol isn&apos;t being saved on this device — your
        browser&apos;s storage is unavailable, which is common in private
        browsing. Download a copy to keep your work.
      </span>
      <Button
        size="small"
        color="sea-green"
        onClick={() => void dispatch(exportNetcanvas())}
      >
        Download .netcanvas
      </Button>
    </div>
  );
};

export default StorageUnavailableBanner;
