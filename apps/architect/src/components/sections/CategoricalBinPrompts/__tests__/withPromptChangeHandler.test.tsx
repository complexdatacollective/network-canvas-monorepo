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

// `a` carries the sameAs rule; `b` is a target-only variable — it never
// configures rules of its own, so it has no `validation` key at all (the
// same shape Validations/contradictions.test.ts's target-only dialog test
// uses for Finding 2). Shrinking b's options to something disjoint from a's
// still breaks a's sameAs, even though b's own committed validation is
// absent rather than an empty record.
const CODEBOOK_WITH_TARGET_ONLY_VARIABLE = {
  node: {
    person: {
      variables: {
        a: {
          name: 'A',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
          validation: { sameAs: 'b' },
        },
        b: {
          name: 'B',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
        },
      },
    },
  },
};

type HandleChangePrompt = (value: {
  variable: string;
  variableOptions: unknown;
  otherVariable?: string;
}) => Promise<unknown>;

type OwnProps = { form: string; entity: 'node' | 'edge' | 'ego'; type: string };

// Renders the real connect()-ed handler against a store seeded with the given
// codebook, and captures its handleChangePrompt prop for direct invocation —
// the same capture-a-handler-prop idiom
// FamilyPedigree/__tests__/NodeConfigurationHandlers.test.tsx uses for this
// app's other withHandlers-based submit handlers. `protocol` and
// `editFormInitial` seed the fuller state the Task 9 cross-class gate reads
// (a WHOLE protocol with `stages`, for the role map; the shared row-editor
// form's `initial` values, for the gate's unchanged-pick escape) — defaulting
// to a codebook-only protocol and no in-progress edit, matching every
// pre-Task-9 call site.
const captureHandleChangePrompt = (
  codebook: unknown = CODEBOOK,
  protocol?: unknown,
  editFormInitial?: Record<string, unknown>,
): HandleChangePrompt => {
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
      activeProtocol: (state = { present: protocol ?? { codebook } }) => state,
      form: (
        state = editFormInitial
          ? { 'editable-list-form': { initial: editFormInitial } }
          : {},
      ) => state,
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

  // Finding 3 (second-wave review): a target-only variable — one that only
  // ever appears as the target of another's sameAs/comparator, never
  // configuring rules of its own — previously bypassed this check entirely,
  // because the guard required `existingVariable.validation` to already be a
  // record. Editing such a variable's options must still be checked against
  // relationships incoming from other variables.
  it('blocks a save that breaks an incoming sameAs from a target-only variable with no validation of its own', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      CODEBOOK_WITH_TARGET_ONLY_VARIABLE,
    );
    let thrown: unknown;
    try {
      await handleChangePrompt({
        variable: 'b',
        // Disjoint from a's options — breaks a's sameAs: 'b'.
        variableOptions: [
          { label: 'Green', value: 'green' },
          { label: 'Yellow', value: 'yellow' },
        ],
      });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('handleChangePrompt did not block the save');
    }
    expect(thrown.errors).toEqual({
      variableOptions: {
        _error: expect.stringContaining('share no option values'),
      },
    });
  });
});

// Task 9: the save-time cross-class gate — this bin (an UNVALIDATED writer)
// may not save a variable a form elsewhere already collects. `cat` is
// written both by an AlterForm field (validated, stage s1) and by this very
// CategoricalBin prompt (unvalidated, stage s2) — the same fixture shape
// pickerExclusions.test.ts uses for the Task 8 picker exclusions.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
  ],
};

describe('CategoricalBinPrompts withPromptChangeHandler cross-class gate', () => {
  it('throws a SubmissionError keyed at variable with the mirror message', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      PROTOCOL_WITH_FORM_CONFLICT,
    );
    let thrown: unknown;
    try {
      await handleChangePrompt({
        variable: 'cat',
        variableOptions: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('handleChangePrompt did not block the save');
    }
    expect(thrown.errors).toEqual({
      variable:
        '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
  });

  it('escapes when the pick equals the prompt’s original committed variable (editing without changing)', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      PROTOCOL_WITH_FORM_CONFLICT,
      { variable: 'cat' },
    );
    const result = await handleChangePrompt({
      variable: 'cat',
      variableOptions: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    });
    expect(result).toMatchObject({ variable: 'cat' });
  });

  it('allows a save with no cross-class conflict', async () => {
    const formOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const handleChangePrompt = captureHandleChangePrompt(undefined, formOnly);
    const result = await handleChangePrompt({
      variable: 'cat',
      variableOptions: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    });
    expect(result).toMatchObject({ variable: 'cat' });
  });
});

// Final-review fix: `otherVariable` is a VALIDATED writer (its follow-up
// input honours the referenced variable's codebook validation), so it carries
// the MIRROR gate: reject a pick a bin/highlight/census/etc. elsewhere
// already writes without validation. `other` is a text variable written
// without validation by a FamilyPedigree relationshipVariable (stage s2) — and,
// in the same-class control, collected by an AlterForm field (stage s3)
// instead.
const OTHER_VARIABLE_CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        cat: {
          name: 'Cat',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
        other: { name: 'Other', type: 'text' },
      },
    },
  },
};

const OTHER_UNVALIDATED_STAGE = {
  id: 's2',
  type: 'FamilyPedigree',
  label: 'P',
  nodeConfig: { type: 'person', relationshipVariable: 'other' },
};

const OTHER_VALIDATED_STAGE = {
  id: 's3',
  type: 'AlterForm',
  label: 'F',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'T', text: 'X' },
  form: { fields: [{ variable: 'other', prompt: 'P' }] },
};

const otherVariableProtocol = (stages: unknown[]) => ({
  schemaVersion: 8,
  codebook: OTHER_VARIABLE_CODEBOOK,
  stages,
});

const OTHER_PROMPT_VALUE = {
  variable: 'cat',
  variableOptions: [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
  ],
  otherVariable: 'other',
};

describe('CategoricalBinPrompts withPromptChangeHandler otherVariable mirror gate', () => {
  it('throws a SubmissionError keyed at otherVariable with the mirror message', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      otherVariableProtocol([OTHER_UNVALIDATED_STAGE]),
    );
    let thrown: unknown;
    try {
      await handleChangePrompt(OTHER_PROMPT_VALUE);
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('handleChangePrompt did not block the save');
    }
    expect(thrown.errors).toEqual({
      otherVariable:
        '"Other" is written without validation by another stage, so it cannot be used as a form field',
    });
  });

  it('escapes when the pick equals the prompt’s original committed otherVariable (editing without changing)', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      otherVariableProtocol([OTHER_UNVALIDATED_STAGE]),
      { otherVariable: 'other' },
    );
    const result = await handleChangePrompt(OTHER_PROMPT_VALUE);
    expect(result).toMatchObject({ otherVariable: 'other' });
  });

  it('allows a pick only a form elsewhere already validates (same class)', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      otherVariableProtocol([OTHER_VALIDATED_STAGE]),
    );
    const result = await handleChangePrompt(OTHER_PROMPT_VALUE);
    expect(result).toMatchObject({ otherVariable: 'other' });
  });
});
