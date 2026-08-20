import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import type { AppDispatch } from '~/ducks/store';

import { reportError } from './reportError';

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
      const assetList = skippedAssets.map((asset) => asset.name).join(', ');
      void openDialog({
        type: 'acknowledge',
        intent: 'warning',
        title: 'Some assets could not be exported',
        description:
          'Your protocol was downloaded, but these assets could not be ' +
          `included and are missing from the file: ${assetList}.`,
        actions: { primary: { label: 'OK', value: true } },
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
      title: 'Your protocol could not be downloaded',
      description:
        'Something went wrong while preparing the file. Please try again.',
      actions: { primary: { label: 'OK', value: true } },
    });
    return false;
  }
};
