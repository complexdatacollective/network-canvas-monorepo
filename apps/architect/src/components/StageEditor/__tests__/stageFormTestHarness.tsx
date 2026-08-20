import {
  configureStore,
  type Middleware,
  type Reducer,
} from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import stageEditorDraft, {
  draftSnapshot,
} from '~/ducks/modules/stageEditorDraft';

import StageFormBridge from '../StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '../stageFormContext';
import {
  type StageDraftHistory,
  useStageDraftHistory,
} from '../useStageDraftHistory';

export const asStage = (values: Record<string, unknown>) =>
  values as unknown as Stage;

export type Prompt = { id: string; text: string };

/** Stable empty array: `initialValue` is a register-effect dependency. */
export const NO_PROMPTS: Prompt[] = [];

/**
 * Stands in for the array editors, which register one opaque field per array
 * and emit whole-array changes.
 */
export const PromptListControl = ({
  value = NO_PROMPTS,
  onChange,
}: {
  value?: Prompt[];
  onChange?: (value: Prompt[]) => void;
}) => (
  <div>
    <button
      type="button"
      onClick={() =>
        onChange?.([
          ...value,
          { id: `p${value.length + 1}`, text: `Prompt ${value.length + 1}` },
        ])
      }
    >
      Add prompt
    </button>
    <button
      type="button"
      onClick={() =>
        onChange?.(
          value.map((prompt, index) =>
            index === 0 ? { ...prompt, text: `${prompt.text}!` } : prompt,
          ),
        )
      }
    >
      Edit first prompt
    </button>
    <button type="button" onClick={() => onChange?.([...value].toReversed())}>
      Reverse prompts
    </button>
    <span data-testid="prompt-count">{value.length}</span>
  </div>
);

type RenderStageFormOptions = {
  committedStage?: Stage | null;
  children: ReactNode;
  /**
   * Slices beyond `stageEditorDraft` that the component under test reads —
   * most often a stub `activeProtocol` supplying a codebook.
   */
  extraReducers?: Record<string, Reducer>;
};

/**
 * Renders the real bridge over a real fresco-ui form store and a real draft
 * slice. Only `stageEditorDraft` is mounted: it is the only slice the bridge
 * and the history hook read.
 */
export const renderStageForm = ({
  committedStage = null,
  children,
  extraReducers,
}: RenderStageFormOptions) => {
  // A dispatched `draftSnapshot` is the only unambiguous signal that a
  // snapshot was taken, so record the payloads as they pass through.
  const snapshots: Stage[] = [];
  const recordSnapshots: Middleware = () => (next) => (action) => {
    if (draftSnapshot.match(action)) {
      snapshots.push(action.payload);
    }
    return next(action);
  };

  const store = configureStore({
    reducer: { stageEditorDraft, ...extraReducers },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }).concat(recordSnapshots),
  });

  let context: StageFormContextValue | null = null;
  let history: StageDraftHistory | null = null;

  const Probe = () => {
    context = useStageFormContext();
    history = useStageDraftHistory();
    return null;
  };

  const Tree = ({ children: content }: { children: ReactNode }) => (
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={committedStage}
          stageId="stage-1"
          formId="edit-stage"
        >
          <Probe />
          {content}
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>
  );

  const view = render(<Tree>{children}</Tree>);

  const getContext = () => {
    if (!context) throw new Error('stage form context was not captured');
    return context;
  };

  return {
    ...view,
    store,
    snapshots,
    getContext,
    getHistory: () => {
      if (!history) throw new Error('draft history was not captured');
      return history;
    },
    getStoreApi: () => getContext().storeApi,
    getFormValues: () => getContext().storeApi.getState().getFormValues(),
    getFieldState: (name: string) =>
      getContext().storeApi.getState().getFieldState(name),
    // The stage half of the draft timeline entry: these specs assert form
    // values, not the editor's codebook copy.
    getPresent: () => store.getState().stageEditorDraft.history.present?.stage,
    getPresentCodebook: () =>
      store.getState().stageEditorDraft.history.present?.codebook,
    getLiveValues: () => store.getState().stageEditorDraft.ui.liveValues,
    renderTree: (content: ReactNode) => view.rerender(<Tree>{content}</Tree>),
  };
};
