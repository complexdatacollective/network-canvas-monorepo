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
    defaultMessage: 'Some resources could not be read',
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
  unresolvedAssets: {
    id: 'architect.final.utils.downloadActiveProtocol.unresolvedAssets',
    defaultMessage:
      'These resources could not be read, so your protocol was not downloaded: {assetList}. Add the files again in Resources, then download it.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

/**
 * Downloads the open protocol as a .netcanvas file, reporting failure to the
 * researcher.
 *
 * A protocol whose resources cannot all be read is not downloaded at all. The
 * alternative — writing the file without them — hands the researcher a backup
 * that no version of Architect can open, because the stages referring to those
 * resources would have nothing to refer to. Nothing is lost by refusing: the
 * protocol is still in the library exactly as it was.
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
    const result = await dispatch(exportNetcanvas(protocol)).unwrap();
    if (result.status === 'unresolved-assets') {
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, {
          message: utilityMessages.someAssetsCouldNotBeExported,
        }),
        description: createElement(AppErrorMessage, {
          error: createMessageError(finalMessages.unresolvedAssets, {
            assetList: { list: result.assetNames },
          }),
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
