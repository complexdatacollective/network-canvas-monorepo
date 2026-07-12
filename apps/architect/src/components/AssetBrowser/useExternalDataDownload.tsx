import { get } from 'es-toolkit/compat';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { getAssetManifest } from '~/selectors/protocol';
import { getAssetById } from '~/utils/assetUtils';
import { reportError } from '~/utils/reportError';

const defaultMeta = {
  name: 'Interview network',
};

const useExternalDataDownload = () => {
  const { openDialog } = useDialog();
  const assetManifest = useSelector(getAssetManifest);

  const getAssetInfo = useCallback(
    (id: string) => {
      const source = get(assetManifest, [id, 'source'], '') as string;
      const meta = get(assetManifest, id, defaultMeta) as { name: string };
      const assetPath = `assets/${source}`;
      return [assetPath, meta] as const;
    },
    [assetManifest],
  );

  const handleDownload = useCallback(
    async (id: string) => {
      const [_assetPath, meta] = getAssetInfo(id);

      try {
        // Get the asset from IndexedDB
        const asset = await getAssetById(id);
        if (!asset) {
          return;
        }

        const blob = asset.data;
        if (!(blob instanceof Blob)) {
          return;
        }

        // Create a download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = meta?.name || asset.name || 'download';

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL
        URL.revokeObjectURL(url);
      } catch (error) {
        reportError(error);
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: 'Download failed',
          description: `"${meta.name}" could not be downloaded.`,
          actions: { primary: { label: 'OK', value: true } },
        });
      }
    },
    [getAssetInfo, openDialog],
  );

  return handleDownload;
};

export default useExternalDataDownload;
