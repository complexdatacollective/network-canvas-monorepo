import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

export const asStage = (values: Record<string, unknown>) =>
  values as unknown as Stage;

/**
 * `NodeConfiguration` reads both the stage form (via `StageFormBridge`, for
 * `useStageFormValue`/`useStageInitialValue`) and the codebook/role-map
 * selectors (via `useAppSelector`, backed by `activeProtocol`) — two
 * concerns `StageEditor/__tests__/stageFormTestHarness.tsx`'s
 * `renderStageForm` doesn't combine, since it only mounts `stageEditorDraft`.
 * This is that harness's `activeProtocol`-carrying sibling, kept local to
 * this directory rather than generalising the shared one.
 */
export const renderNodeConfiguration = ({
  protocol,
  committedStage = null,
  children,
}: {
  protocol: unknown;
  committedStage?: Stage | null;
  children: ReactNode;
}) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      stageEditorDraft,
    },
  });

  let context: StageFormContextValue | null = null;
  const Probe = () => {
    context = useStageFormContext();
    return null;
  };

  const view = render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={committedStage}
          stageId="stage-1"
          formId="edit-stage"
        >
          <Probe />
          {children}
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  const getContext = () => {
    if (!context) throw new Error('stage form context was not captured');
    return context;
  };

  return {
    ...view,
    store,
    getContext,
    getFormValues: () => getContext().storeApi.getState().getFormValues(),
    getFieldState: (name: string) =>
      getContext().storeApi.getState().getFieldState(name),
  };
};
