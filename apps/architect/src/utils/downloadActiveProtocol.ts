import { createElement } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, AppMessage } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import type { AppDispatch } from '~/ducks/store';

import { reportError } from './reportError';
const utilityMessages = defineMessages({
  someAssetsCouldNotBeExported: {
    id: 'architect.utility.utils.downloadActiveProtocol.someAssetsCouldNotBeExported',
    defaultMessage: 'Some assets could not be exported',
    description: 'The title text in utils / downloadActiveProtocol.',
  },
  oK: {
    id: 'architect.utility.utils.downloadActiveProtocol.oK',
    defaultMessage: 'OK',
    description: 'The label text in utils / downloadActiveProtocol.',
  },
  yourProtocolCouldNotBeDownloaded: {
    id: 'architect.utility.utils.downloadActiveProtocol.yourProtocolCouldNotBeDownloaded',
    defaultMessage: 'Your protocol could not be downloaded',
    description: 'The title text in utils / downloadActiveProtocol.',
  },
  somethingWentWrongWhilePreparingThe: {
    id: 'architect.utility.utils.downloadActiveProtocol.somethingWentWrongWhilePreparingThe',
    defaultMessage:
      'Something went wrong while preparing the file. Please try again.',
    description: 'The description text in utils / downloadActiveProtocol.',
  },
});
const finalMessages = defineMessages({
  skippedAssets: {
    id: 'architect.final.utils.downloadActiveProtocol.skippedAssets',
    defaultMessage:
      'Your protocol was downloaded, but these assets could not be included and are missing from the file: {assetList}.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

/**
 * Downloads the open protocol as a .netcanvas file, reporting both partial and
 * total failure to the researcher.
 *
 * `protocol` overrides what is written into the file. Pass it only where the
 * canonical protocol is not what the researcher is being offered — rescuing an
 * uncommitted stage draft, which lives outside `activeProtocol`.
 */
export const downloadActiveProtocol = async (
  dispatch: AppDispatch,
  openDialog: DialogContextType['openDialog'],
  protocol?: CurrentProtocol,
): Promise<boolean> => {
  try {
    const { skippedAssets } = await dispatch(
      exportNetcanvas(protocol),
    ).unwrap();
    if (skippedAssets.length > 0) {
      void openDialog({
        type: 'acknowledge',
        intent: 'warning',
        title: createElement(AppMessage, {
          message: utilityMessages.someAssetsCouldNotBeExported,
        }),
        description: createElement(AppErrorMessage, {
          error: createMessageError(finalMessages.skippedAssets, {
            assetList: { list: skippedAssets.map((asset) => asset.name) },
          }),
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: utilityMessages.oK }),
            value: true,
          },
        },
      });
    }
    return true;
  } catch (error) {
    // The normalized error goes to the reporter, never into the dialog: these
    // messages are internal (RTK's `.unwrap()` rethrows a serialized error,
    // stack trace and all) and mean nothing to a researcher.
    reportError(error);
    void openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      title: createElement(AppMessage, {
        message: utilityMessages.yourProtocolCouldNotBeDownloaded,
      }),
      description: createElement(AppMessage, {
        message: utilityMessages.somethingWentWrongWhilePreparingThe,
      }),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: utilityMessages.oK }),
          value: true,
        },
      },
    });
    return false;
  }
};
