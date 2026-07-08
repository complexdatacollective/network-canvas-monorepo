import { TriangleAlert } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getStorageUnavailable } from '~/ducks/modules/app';
import { generalErrorDialog } from '~/ducks/modules/userActions/dialogs';
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
      className="bg-warning/20 text-text flex items-center justify-between gap-5 px-7 py-2.5 text-sm"
    >
      <span className="flex items-center gap-2.5">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        This protocol isn&apos;t being saved on this device — your
        browser&apos;s storage is unavailable, which is common in private
        browsing. Download a copy to keep your work.
      </span>
      <Button
        size="small"
        color="sea-green"
        onClick={() => {
          // This is the one escape hatch for work that isn't being persisted,
          // so a failed download must surface rather than fail silently.
          void dispatch(exportNetcanvas())
            .unwrap()
            .catch(() => {
              dispatch(
                generalErrorDialog(
                  'Download failed',
                  "Your protocol couldn't be downloaded. Please try again.",
                ),
              );
            });
        }}
      >
        Download .netcanvas
      </Button>
    </div>
  );
};

export default StorageUnavailableBanner;
