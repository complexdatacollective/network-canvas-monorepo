import { get } from 'es-toolkit/compat';
import { createElement, useCallback } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { assetMetadataMessages } from '~/components/Assets/assetMetadataMessages';
import { getDisplayAssetManifest } from '~/selectors/protocol';
import { getAssetById } from '~/utils/assetUtils';
import { reportError } from '~/utils/reportError';
const messages = defineMessages({
  downloadFailed: {
    id: 'architect.assetBrowser.useExternalDataDownload.downloadFailed',
    defaultMessage: 'Download failed',
    description:
      'The title text in components / AssetBrowser / useExternalDataDownload.',
  },
  couldNotBeDownloaded: {
    id: 'architect.assetBrowser.useExternalDataDownload.couldNotBeDownloaded',
    defaultMessage: '"{value1}" could not be downloaded.',
    description:
      'The description text in components / AssetBrowser / useExternalDataDownload.',
  },
  oK: {
    id: 'architect.assetBrowser.useExternalDataDownload.oK',
    defaultMessage: 'OK',
    description:
      'The label text in components / AssetBrowser / useExternalDataDownload.',
  },
});

const useExternalDataDownload = () => {
  const intl = useAppIntl();
  const { openDialog } = useDialog();
  // The download is named after the card the researcher clicked, not after a
  // stored name it may share with another card — downloading two resources
  // both called `people.csv` is how "which one is which?" reaches the file
  // system. `source` still comes from the same entry and is unchanged.
  const assetManifest = useSelector(getDisplayAssetManifest);

  const getAssetInfo = useCallback(
    (id: string) => {
      const source = get(assetManifest, [id, 'source'], '') as string;
      const meta = get(assetManifest, id, {
        name: intl.formatMessage(assetMetadataMessages.interviewNetwork),
      }) as { name: string };
      const assetPath = `assets/${source}`;
      return [assetPath, meta] as const;
    },
    [assetManifest, intl],
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
          title: createElement(AppMessage, {
            message: messages.downloadFailed,
          }),
          description: createElement(AppMessage, {
            message: messages.couldNotBeDownloaded,
            values: {
              value1: meta.name,
            },
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
      }
    },
    [getAssetInfo, openDialog],
  );

  return handleDownload;
};

export default useExternalDataDownload;
