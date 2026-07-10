import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DragControls } from 'motion/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleCreateVariable: vi.fn(async () => 'created-variable'),
}));

vi.mock('../../enhancers/withCreateVariableHandler', () => ({
  default:
    (WrappedComponent: ComponentType<Record<string, unknown>>) =>
    (props: Record<string, unknown>) => (
      <WrappedComponent
        {...props}
        handleCreateVariable={mocks.handleCreateVariable}
        handleDeleteVariable={() => undefined}
        normalizeKeyDown={() => undefined}
      />
    ),
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    componentProps = {},
  }: {
    name: string;
    componentProps?: Record<string, unknown>;
  }) => {
    const onCreateOption = componentProps.onCreateOption as
      | ((value: string) => void)
      | undefined;

    return (
      <div data-testid={name}>
        {name}
        {onCreateOption && (
          <button type="button" onClick={() => onCreateOption('new-variable')}>
            Create variable
          </button>
        )}
        {Array.isArray(componentProps.options) && (
          <span data-testid={`${name}-options`}>
            {JSON.stringify(componentProps.options)}
          </span>
        )}
      </div>
    );
  },
}));

import Attribute, { type AttributeValue } from '../Attribute';

type FormValues = {
  attributes: AttributeValue[];
};

const onDelete = vi.fn();

const Harness = (_props: InjectedFormProps<FormValues>) => (
  <Attribute
    arrayName="attributes"
    fieldName="attributes[0]"
    form="attribute-test"
    showErrors={false}
    item={{
      variable: 'existing-variable',
      value: true,
      _internalId: 'attribute-1',
    }}
    index={0}
    itemCount={1}
    isNewItem={false}
    onChange={() => undefined}
    onUpdate={() => undefined}
    onCancel={() => undefined}
    onDelete={onDelete}
    onEdit={() => undefined}
    onMove={() => undefined}
    isSortable={false}
    isBeingEdited={false}
    disabled={false}
    readOnly={false}
    dragControls={{} as DragControls}
    variableOptions={[
      {
        label: 'Existing variable',
        value: 'existing-variable',
        type: 'boolean',
      },
    ]}
    entity="node"
    type="person"
  />
);

const ReduxHarness = reduxForm<FormValues>({ form: 'attribute-test' })(Harness);

describe('Attribute', () => {
  beforeEach(() => {
    mocks.handleCreateVariable.mockClear();
    onDelete.mockClear();
  });

  it('uses indexed paths for creation and the boolean value field', () => {
    const store = configureStore({ reducer: { form: formReducer } });

    render(
      <Provider store={store}>
        <ReduxHarness
          initialValues={{
            attributes: [{ variable: 'existing-variable', value: true }],
          }}
        />
      </Provider>,
    );

    expect(screen.getByTestId('attributes[0].variable')).toBeInTheDocument();
    expect(screen.getByTestId('attributes[0].value')).toBeInTheDocument();
    expect(screen.getByTestId('attributes[0].value-options')).toHaveTextContent(
      JSON.stringify([
        { label: 'True', value: true },
        { label: 'False', value: false },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create variable' }));
    expect(mocks.handleCreateVariable).toHaveBeenCalledWith(
      'new-variable',
      'boolean',
      'attributes[0].variable',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete attribute' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
