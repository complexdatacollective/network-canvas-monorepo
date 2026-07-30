import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { compose } from 'react-recompose';
import { Provider } from 'react-redux';
import { SubmissionError } from 'redux-form';
import { describe, expect, it } from 'vitest';

import withPromptChangeHandler from '../withPromptChangeHandler';

// `a` carries the sameAs rule; `b` is a target-only variable — it never
// configures rules of its own, so it has no `validation` key at all (the
// same shape CategoricalBinPrompts's withPromptChangeHandler.test.tsx uses
// for its own target-only-variable case). Shrinking b's options to something
// disjoint from a's still breaks a's sameAs, even though b's own committed
// validation is absent rather than an empty record. Ordinal (not
// categorical) because that is the only variable type the Tie-Strength
// Census editor's VariablePicker offers for `edgeVariable`.
const CODEBOOK_WITH_TARGET_ONLY_VARIABLE = {
  edge: {
    friend: {
      variables: {
        a: {
          name: 'A',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 'weak' },
            { label: 'Strong', value: 'strong' },
          ],
          validation: { sameAs: 'b' },
        },
        b: {
          name: 'B',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 'weak' },
            { label: 'Strong', value: 'strong' },
          ],
        },
      },
    },
  },
};

type HandleChangePrompt = (value: {
  createEdge: string;
  edgeVariable: string;
  variableOptions: unknown;
}) => Promise<unknown>;

type OwnProps = { form: string };

// Renders the real connect()-ed handler against a store seeded with the given
// codebook, and captures its handleChangePrompt prop for direct invocation —
// the same capture-a-handler-prop idiom CategoricalBinPrompts's
// withPromptChangeHandler.test.tsx uses for this app's other
// withHandlers-based submit handlers. `protocol` and `editFormInitial` seed
// the fuller state the Task 9 cross-class gate reads (a WHOLE protocol with
// `stages`, for the role map; the shared row-editor form's `initial` values,
// for the gate's unchanged-pick escape) — defaulting to a codebook-only
// protocol and no in-progress edit, matching every pre-Task-9 call site.
const captureHandleChangePrompt = (
  codebook: unknown = CODEBOOK_WITH_TARGET_ONLY_VARIABLE,
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
      <Harness form="prompts-form" />
    </Provider>,
  );

  if (!captured) throw new Error('handleChangePrompt was not captured');
  return captured;
};

describe('TieStrengthCensusPrompts withPromptChangeHandler options contradiction', () => {
  it('blocks a save that breaks an incoming sameAs from a target-only edge variable with no validation of its own', async () => {
    const handleChangePrompt = captureHandleChangePrompt();
    let thrown: unknown;
    try {
      await handleChangePrompt({
        createEdge: 'friend',
        edgeVariable: 'b',
        // Disjoint from a's options — breaks a's sameAs: 'b'.
        variableOptions: [
          { label: 'Other', value: 'other' },
          { label: 'Different', value: 'different' },
        ],
      });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('handleChangePrompt did not block the save');
    }
    // redux-form's ConnectedFieldArray reads a FieldArray's submit error only
    // from submitErrors.<name>._error (ConnectedFieldArray.js) — a bare
    // string under submitErrors.variableOptions would be invisible to the
    // field, which is exactly the bug this pins.
    expect(thrown.errors).toEqual({
      variableOptions: {
        _error: expect.stringContaining('share no option values'),
      },
    });
  });

  it('allows a save that keeps the sameAs group satisfiable', async () => {
    const handleChangePrompt = captureHandleChangePrompt();
    const result = await handleChangePrompt({
      createEdge: 'friend',
      edgeVariable: 'b',
      // Overlaps a's options — a's sameAs: 'b' stays satisfiable.
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Medium', value: 'medium' },
      ],
    });
    expect(result).toMatchObject({ edgeVariable: 'b', createEdge: 'friend' });
  });
});

// Task 9: the save-time cross-class gate — this census prompt (an
// UNVALIDATED writer) may not save an edgeVariable a form elsewhere already
// collects. `strength` is written both by an AlterEdgeForm field (validated,
// stage s1) and by this very TieStrengthCensus prompt (unvalidated, stage
// s2), scoped to the edge type ('friend') this PROMPT'S OWN createEdge names.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    edge: {
      friend: {
        name: 'Friend',
        color: 'c',
        variables: {
          strength: {
            name: 'Strength',
            type: 'ordinal',
            options: [
              { label: 'Weak', value: 'weak' },
              { label: 'Strong', value: 'strong' },
            ],
          },
        },
      },
    },
    node: {
      person: { name: 'Person', color: 'c', variables: {} },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterEdgeForm',
      label: 'F',
      subject: { entity: 'edge', type: 'friend' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'strength', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'TieStrengthCensus',
      label: 'C',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      prompts: [
        {
          id: 'p1',
          text: 'T',
          createEdge: 'friend',
          edgeVariable: 'strength',
          negativeLabel: 'None',
        },
      ],
    },
  ],
};

describe('TieStrengthCensusPrompts withPromptChangeHandler cross-class gate', () => {
  it('throws a SubmissionError keyed at edgeVariable with the mirror message', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      PROTOCOL_WITH_FORM_CONFLICT,
    );
    let thrown: unknown;
    try {
      await handleChangePrompt({
        createEdge: 'friend',
        edgeVariable: 'strength',
        variableOptions: [
          { label: 'Weak', value: 'weak' },
          { label: 'Strong', value: 'strong' },
        ],
      });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof SubmissionError)) {
      throw new Error('handleChangePrompt did not block the save');
    }
    expect(thrown.errors).toEqual({
      edgeVariable:
        '"Strength" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
  });

  it('escapes when the pick equals the prompt’s original committed edgeVariable (editing without changing)', async () => {
    const handleChangePrompt = captureHandleChangePrompt(
      undefined,
      PROTOCOL_WITH_FORM_CONFLICT,
      { edgeVariable: 'strength' },
    );
    const result = await handleChangePrompt({
      createEdge: 'friend',
      edgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toMatchObject({
      edgeVariable: 'strength',
      createEdge: 'friend',
    });
  });

  it('allows a save with no cross-class conflict', async () => {
    const censusOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const handleChangePrompt = captureHandleChangePrompt(undefined, censusOnly);
    const result = await handleChangePrompt({
      createEdge: 'friend',
      edgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toMatchObject({
      edgeVariable: 'strength',
      createEdge: 'friend',
    });
  });
});
