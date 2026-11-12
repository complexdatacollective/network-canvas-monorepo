import { createElement } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getStorageUnavailable } from '~/ducks/modules/app';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';

import {
  DownloadRefusalMessage,
  DownloadRefusalTitle,
} from './DefaultLanguageTextAlert';
const messages = defineMessages({
  thisProtocolIsnTBeingSavedOn: {
    id: 'architect.storageUnavailableBanner.thisProtocolIsnTBeingSavedOn',
    defaultMessage:
      "This protocol isn't being saved on this device — local app storage is unavailable, which is common in private browsing. Download a copy to keep your work.",
    description:
      "Warning banner across the protocol editor, shown when the browser's local storage is unavailable (common in private browsing) so the open protocol is held only in memory. Its button downloads a copy.",
  },
  downloadNetcanvas: {
    id: 'architect.storageUnavailableBanner.downloadNetcanvas',
    defaultMessage: 'Download .netcanvas',
    description:
      'Button in the storage-unavailable banner. Downloads the protocol as a .netcanvas file so work is not lost. The extension .netcanvas is the file format name and stays as it is.',
  },
  someAssetsCouldNotBeExported: {
    id: 'architect.storageUnavailableBanner.someAssetsCouldNotBeExported',
    defaultMessage: 'Some resources could not be read',
    description:
      'Title of the dialog shown when downloading the protocol was stopped because some resources (uploaded files such as images, video or audio) could not be read.',
  },
  oK: {
    id: 'architect.storageUnavailableBanner.oK',
    defaultMessage: 'OK',
    description:
      'Button that dismisses the dialogs shown after a failed attempt to download the protocol from the storage-unavailable banner.',
  },
  downloadFailed: {
    id: 'architect.storageUnavailableBanner.downloadFailed',
    defaultMessage: 'Download failed',
    description:
      'Title of the error dialog shown when downloading the protocol from the storage-unavailable banner failed unexpectedly.',
  },
  yourProtocolCouldnTBeDownloadedPlease: {
    id: 'architect.storageUnavailableBanner.yourProtocolCouldnTBeDownloadedPlease',
    defaultMessage: "Your protocol couldn't be downloaded. Please try again.",
    description:
      'Body of the Download failed dialog, shown when downloading the protocol failed unexpectedly. Asks the researcher to try again.',
  },
});
const finalMessages = defineMessages({
  skippedAssets: {
    id: 'architect.final.components.StorageUnavailableBanner.skippedAssets',
    defaultMessage:
      'These resources could not be read, so your protocol was not downloaded: {assetList}. Add the files again in Resources, then download it.',
    description:
      "Body of the dialog shown when a protocol download was stopped because resources (uploaded files) could not be read. assetList is the list of those resources' names. Resources is the name of the screen where files are added.",
  },
});

// Shown across the protocol editor when a protocol was opened from an in-memory
// copy because the browser's storage is unavailable (e.g. private browsing).
// Non-blocking: the user can keep editing, but their work won't persist, so we
// keep a download action close at hand.
const StorageUnavailableBanner = () => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const storageUnavailable = useAppSelector(getStorageUnavailable);

  if (!storageUnavailable) {
    return null;
  }

  return (
    <Alert
      variant="warning"
      density="compact"
      className="my-0 rounded-none! px-7 py-2.5 shadow-none!"
    >
      <AlertDescription className="flex items-center justify-between gap-5 text-sm">
        <span>{intl.formatMessage(messages.thisProtocolIsnTBeingSavedOn)}</span>
        <Button
          size="sm"
          color="primary"
          onClick={() => {
            // This is the one escape hatch for work that isn't being persisted,
            // so a failed download must surface rather than fail silently.
            void dispatch(exportNetcanvas())
              .unwrap()
              .then((result) => {
                if (result.status === 'download-refused') {
                  void openDialog({
                    type: 'acknowledge',
                    intent: 'destructive',
                    title: createElement(DownloadRefusalTitle),
                    description: createElement(DownloadRefusalMessage, {
                      problem: result.problem,
                    }),
                    actions: {
                      primary: {
                        label: createElement(AppMessage, {
                          message: messages.oK,
                        }),
                        value: true,
                      },
                    },
                  });
                  return undefined;
                }
                if (result.status !== 'unresolved-assets') return undefined;
                void openDialog({
                  type: 'acknowledge',
                  intent: 'destructive',
                  title: createElement(AppMessage, {
                    message: messages.someAssetsCouldNotBeExported,
                  }),
                  description: createElement(AppErrorMessage, {
                    error: createMessageError(finalMessages.skippedAssets, {
                      assetList: { list: result.assetNames },
                    }),
                  }),
                  actions: {
                    primary: {
                      label: createElement(AppMessage, {
                        message: messages.oK,
                      }),
                      value: true,
                    },
                  },
                });
                return undefined;
              })
              .catch(() => {
                void openDialog({
                  type: 'acknowledge',
                  intent: 'destructive',
                  title: createElement(AppMessage, {
                    message: messages.downloadFailed,
                  }),
                  description: createElement(AppMessage, {
                    message: messages.yourProtocolCouldnTBeDownloadedPlease,
                  }),
                  actions: {
                    primary: {
                      label: createElement(AppMessage, {
                        message: messages.oK,
                      }),
                      value: true,
                    },
                  },
                });
              });
          }}
        >
          {intl.formatMessage(messages.downloadNetcanvas)}
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default StorageUnavailableBanner;
