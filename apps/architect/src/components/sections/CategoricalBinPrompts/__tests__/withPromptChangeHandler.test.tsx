import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { compose } from 'react-recompose';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  stopSubmit,
  SubmissionError,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Options from '~/components/Options/Options';

import withPromptChangeHandler from '../withPromptChangeHandler';

// A categorical variable committed with minSelected: 3 and 3 options — the
// same shape Validations/contradictions.test.ts's "checks minSelected
// against draft options" case uses — so a draft of only 2 options
// contradicts its own committed validation rule.
const CODEBOOK = {
  node: {
    person: {
      variables: {
        colors: {
          name: 'Colors',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
            { label: 'Green', value: 'green' },
          ],
          validation: { minSelected: 3 },
        },
      },
    },
  },
};

type HandleChangePrompt = (value: {
  variable: string;
  variableOptions: unknown;
}) => Promise<unknown>;

type OwnProps = { form: string; entity: 'node' | 'edge' | 'ego'; type: string };

// Renders the real connect()-ed handler against a store seeded with
// CODEBOOK, and captures its handleChangePrompt prop for direct invocation —
// the same capture-a-handler-prop idiom
// FamilyPedigree/__tests__/NodeConfigurationHandlers.test.tsx uses for this
// app's other withHandlers-based submit handlers.
const captureHandleChangePrompt = (): HandleChangePrompt => {
  let captured: HandleChangePrompt | undefined;
  const Capture = (props: { handleChangePrompt: HandleChangePrompt }) => {
    captured = props.handleChangePrompt;
    return null;
  };
  // withPromptChangeHandler.tsx composes `connect` and `withHandlers` without
  // explicit type arguments, so its own inferred type collapses to
  // ComponentType<unknown> — the same reason CategoricalBinPrompts.tsx wraps
  // its outer composition in an explicitly-typed compose<TInner, TOutter>.
  const Harness = compose<{ handleChangePrompt: HandleChangePrompt }, OwnProps>(
    withPromptChangeHandler,
  )(Capture);
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: { codebook: CODEBOOK } }) => state,
    },
  });

  render(
    <Provider store={store}>
      <Harness form="prompts-form" entity="node" type="person" />
    </Provider>,
  );

  if (!captured) throw new Error('handleChangePrompt was not captured');
  return captured;
};

const attemptBlockedSave = async (handleChangePrompt: HandleChangePrompt) => {
  try {
    await handleChangePrompt({
      variable: 'colors',
      // Fewer options than colors' committed minSelected: 3.
      variableOptions: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
  } catch (error) {
    return error;
  }
  throw new Error('handleChangePrompt did not block the save');
};

describe('CategoricalBinPrompts withPromptChangeHandler options contradiction', () => {
  it('throws a SubmissionError keyed at variableOptions._error, not a bare string', async () => {
    const handleChangePrompt = captureHandleChangePrompt();
    const thrown = await attemptBlockedSave(handleChangePrompt);

    expect(thrown).toBeInstanceOf(SubmissionError);
    if (!(thrown instanceof SubmissionError)) return;

    // redux-form's ConnectedFieldArray reads a FieldArray's submit error only
    // from submitErrors.<name>._error (ConnectedFieldArray.js) — a bare
    // string under submitErrors.variableOptions would be invisible to the
    // field, which is exactly the bug this pins.
    expect(thrown.errors).toEqual({
      variableOptions: { _error: expect.stringContaining('minSelected') },
    });
  });

  it('renders the blocked-save message through the Options FieldArray error slot', async () => {
    const handleChangePrompt = captureHandleChangePrompt();
    const thrown = await attemptBlockedSave(handleChangePrompt);
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('expected a SubmissionError');
    }

    const FORM_NAME = 'options-error-slot-test';
    type FormValues = { variableOptions: unknown };
    const FieldHarness = (_props: InjectedFormProps<FormValues>) => (
      <Options name="variableOptions" label="Options" />
    );
    const ReduxFieldHarness = reduxForm<FormValues>({ form: FORM_NAME })(
      FieldHarness,
    );

    const formStore = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={formStore}>
        <DialogProvider>
          <ReduxFieldHarness
            initialValues={{
              variableOptions: [
                { label: 'Red', value: 'red' },
                { label: 'Blue', value: 'blue' },
              ],
            }}
          />
        </DialogProvider>
      </Provider>,
    );

    // Replay the handler's real thrown payload the same way redux-form's own
    // handleSubmit reacts to a caught SubmissionError on a blocked save (see
    // handleSubmit.js's executeSubmit, which calls stopSubmit(error)).
    act(() => {
      // redux-form's action creators aren't typed as RTK's UnknownAction —
      // the same cast Form/__tests__/FrescoReduxArrayField.test.tsx uses to
      // dispatch stopSubmit against a configureStore() instance.
      formStore.dispatch(
        stopSubmit(FORM_NAME, thrown.errors) as unknown as UnknownAction,
      );
    });

    expect(screen.getByText(/minSelected/)).toBeInTheDocument();
  });
});
