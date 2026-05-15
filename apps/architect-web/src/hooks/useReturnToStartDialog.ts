import { useCallback } from 'react';
import { useLocation } from 'wouter';

import { useAppDispatch } from '~/ducks/hooks';
import { clearActiveProtocol } from '~/ducks/modules/activeProtocol';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';

export const useReturnToStartDialog = () => {
  const dispatch = useAppDispatch();
  const [, navigate] = useLocation();

  return useCallback(() => {
    dispatch(
      dialogActions.openDialog({
        type: 'Warning',
        title: 'Clear Editor?',
        message:
          'Returning to the start screen will clear the current protocol from the editor. If you have made changes to your protocol, please ensure you have downloaded the updated version before proceeding.',
        confirmLabel: 'Return to start screen',
        onConfirm: () => {
          dispatch(clearActiveProtocol());
          navigate('/');
        },
      }),
    );
  }, [dispatch, navigate]);
};
