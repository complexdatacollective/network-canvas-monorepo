import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

type VariableOption = { value: string; label: string };

const captured = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));

// The row editor itself is exercised in Form/arrayFields/__tests__; this test
// only cares which pool the prompt dialog hands it.
vi.mock('~/components/Form/arrayFields/AssignAttributes', () => ({
  default: (props: Record<string, unknown>) => {
    captured.props = props;
    return <div data-testid="assign-attributes" />;
  },
}));

const getCapturedProps = (): Record<string, unknown> | undefined =>
  captured.props;

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import NameGeneratorPrompts from '../NameGeneratorPrompts';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        flagged: { name: 'Flagged', type: 'boolean' },
        close: { name: 'Close', type: 'boolean' },
      },
    },
  },
};

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

/**
 * The prompt editor's additional-attributes pool must exclude a variable the
 * outer stage's own (not yet saved) form fields already collect, read
 * straight from the stage form store.
 */
it('excludes the outer stage form’s draft validated variables from the pool', async () => {
  captured.props = undefined;

  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = { present: { codebook: CODEBOOK, stages: [] } },
      ) => state,
      stageEditorDraft,
    },
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage({
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'flagged' }] },
            prompts: [{ id: 'p1', text: 'Who do you know?' }],
          })}
          stageId="stage-1"
          formId="edit-stage"
        >
          <NameGeneratorPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="NameGenerator"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
  await screen.findByTestId('assign-attributes');

  await waitFor(() => {
    expect(getCapturedProps()).toBeDefined();
  });
  const props = getCapturedProps();
  if (!props) throw new Error('AssignAttributes did not render');

  expect(props.draftValidatedVariables).toEqual(new Set(['flagged']));
  expect(
    (props.variableOptions as VariableOption[]).map(({ value }) => value),
  ).toEqual(['close']);
});
