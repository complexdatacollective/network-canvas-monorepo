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
// withHandlers-based submit handlers.
const captureHandleChangePrompt = (
  codebook: unknown = CODEBOOK_WITH_TARGET_ONLY_VARIABLE,
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
      activeProtocol: (state = { present: { codebook } }) => state,
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
