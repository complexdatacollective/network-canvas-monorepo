import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { initialize, reducer as formReducer } from 'redux-form';
import { expect, it, vi } from 'vitest';

type MockFieldArrayProps = {
  itemComponentProps?: Record<string, unknown>;
};

const captured: {
  itemComponentProps: Record<string, unknown> | undefined;
} = vi.hoisted(() => ({
  itemComponentProps: undefined,
}));

const getCapturedItemComponentProps = (): Record<string, unknown> | undefined =>
  captured.itemComponentProps;

vi.mock('redux-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('redux-form')>();
  return {
    ...actual,
    FieldArray: (props: MockFieldArrayProps) => {
      captured.itemComponentProps = props.itemComponentProps;
      return <div data-testid="assign-attributes" />;
    },
  };
});

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import AssignAttributes from '../AssignAttributes';

it('derives draft validated roles from the outer stage form', () => {
  captured.itemComponentProps = undefined;
  const formState = formReducer(
    formReducer(
      undefined,
      initialize('edit-stage', {
        form: { fields: [{ variable: 'flagged' }] },
      }),
    ),
    initialize('editable-list-form', { additionalAttributes: [] }),
  );
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: (
        state = {
          present: {
            schemaVersion: 8,
            codebook: {
              node: {
                person: {
                  name: 'Person',
                  color: 'c',
                  variables: {
                    flagged: { name: 'Flagged', type: 'boolean' },
                  },
                },
              },
            },
            stages: [],
          },
        },
      ) => state,
    },
    preloadedState: { form: formState },
  });

  render(
    <Provider store={store}>
      <AssignAttributes
        entity="node"
        type="person"
        form="editable-list-form"
        stageForm="edit-stage"
        name="additionalAttributes"
      />
    </Provider>,
  );

  expect(screen.getByTestId('assign-attributes')).toBeInTheDocument();
  const itemComponentProps = getCapturedItemComponentProps();
  expect(itemComponentProps).toBeDefined();
  if (!itemComponentProps) {
    throw new Error('FieldArray did not receive item component props');
  }
  expect(itemComponentProps.variableOptions).toEqual([]);
  expect(itemComponentProps.draftValidatedVariables).toEqual(
    new Set(['flagged']),
  );
});
