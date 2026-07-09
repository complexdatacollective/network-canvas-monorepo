import { TriangleAlert } from 'lucide-react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getStorageUnavailable } from '~/ducks/modules/app';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';

// Shown across the protocol editor when a protocol was opened from an in-memory
// copy because the browser's storage is unavailable (e.g. private browsing).
// Non-blocking: the user can keep editing, but their work won't persist, so we
// keep a download action close at hand.
const StorageUnavailableBanner = () => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
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
        size="sm"
        color="primary"
        onClick={() => {
          // This is the one escape hatch for work that isn't being persisted,
          // so a failed download must surface rather than fail silently.
          void dispatch(exportNetcanvas())
            .unwrap()
            .then(({ skippedAssets }) => {
              if (skippedAssets.length === 0) return;
              const assetList = skippedAssets
                .map((asset) => asset.name)
                .join(', ');
              void openDialog({
                type: 'acknowledge',
                intent: 'warning',
                title: 'Some assets could not be exported',
                description:
                  'Your protocol was downloaded, but these assets could not be ' +
                  `included and are missing from the file: ${assetList}.`,
                actions: { primary: { label: 'OK', value: true } },
              });
            })
            .catch(() => {
              void openDialog({
                type: 'acknowledge',
                intent: 'destructive',
                title: 'Download failed',
                description:
                  "Your protocol couldn't be downloaded. Please try again.",
                actions: { primary: { label: 'OK', value: true } },
              });
            });
        }}
      >
        Download .netcanvas
      </Button>
    </div>
  );
};

export default StorageUnavailableBanner;
