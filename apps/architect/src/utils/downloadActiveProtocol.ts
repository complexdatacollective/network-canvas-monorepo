import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import type { AppDispatch } from '~/ducks/store';

import { reportError } from './reportError';

export const downloadActiveProtocol = async (
  dispatch: AppDispatch,
  openDialog: DialogContextType['openDialog'],
): Promise<boolean> => {
  try {
    const { skippedAssets } = await dispatch(exportNetcanvas()).unwrap();
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
    const { message } = reportError(error);
    void openDialog({
      type: 'acknowledge',
      intent: 'destructive',
      title: 'Failed to export protocol',
      description: message,
      actions: { primary: { label: 'OK', value: true } },
    });
    return false;
  }
};
