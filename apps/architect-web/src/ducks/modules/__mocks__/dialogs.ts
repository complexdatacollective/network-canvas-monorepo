import type { Dispatch } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';

const OPEN_DIALOG = 'PROTOCOL/OPEN_DIALOG';
const CLOSE_DIALOG = 'PROTOCOL/CLOSE_DIALOG';

type DialogConfig = {
  onConfirm?: () => void;
  onCancel?: () => void;
  [key: string]: unknown;
};

const openDialog = (dialog: DialogConfig) => (dispatch: Dispatch) =>
  new Promise((resolve) => {
    const onConfirm = () => {
      if (dialog.onConfirm) {
        dialog.onConfirm();
      }
      resolve(true);
    };

    const onCancel = () => {
      if (dialog.onCancel) {
        dialog.onCancel();
      }
      resolve(false);
    };

    dispatch({
      id: uuid(),
      type: OPEN_DIALOG,
      dialog: {
        ...dialog,
        onConfirm,
        onCancel,
      },
    });

    onConfirm();
  });

const closeDialog = (id: string) => ({
  type: CLOSE_DIALOG,
  id,
});

const actionCreators = {
  openDialog,
  closeDialog,
};

const actionTypes = {
  OPEN_DIALOG,
  CLOSE_DIALOG,
};

export { actionCreators, actionTypes };
