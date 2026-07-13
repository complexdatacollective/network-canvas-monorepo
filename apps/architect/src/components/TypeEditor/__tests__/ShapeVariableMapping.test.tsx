import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { formValueSelector, reducer as formReducer } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import Editor from '~/components/Editor';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: ({
    input,
    options = [],
  }: {
    input?: { onChange?: (value: string) => void };
    options?: Array<{ label: string; value: string }>;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => input?.onChange?.(option.value)}
        >
          Select {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../ShapePicker', () => ({
  default: ({
    input,
  }: {
    input: { value: string; onChange: (value: string) => void };
  }) => (
    <div>
      {['Circle', 'Square', 'Diamond'].map((label) => {
        const value = label.toLowerCase();
        return (
          <button
            key={value}
            type="button"
            aria-label={`Select shape ${label}`}
            aria-pressed={input.value === value}
            onClick={() => input.onChange(value)}
          />
        );
      })}
    </div>
  ),
}));

import ShapeVariableMapping from '../ShapeVariableMapping';

const formName = 'SHAPE_VARIABLE_MAPPING_TEST';

type ShapeDynamic = {
  variable: string;
  type: string;
  map: Array<{ value: boolean; shape: string }>;
};

describe('ShapeVariableMapping', () => {
  it('authors a discrete mapping with raw boolean values for a Toggle variable', () => {
    const store = configureStore({ reducer: { form: formReducer } });

    render(
      <Provider store={store}>
        <Editor
          form={formName}
          onSubmit={() => undefined}
          initialValues={{
            variables: {
              is_person: {
                name: 'Is Person',
                type: 'boolean',
                component: 'Toggle',
              },
            },
            shape: { default: 'square' },
          }}
        >
          <ShapeVariableMapping form={formName} />
        </Editor>
      </Provider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Map variable to shape' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Is Person' }));

    const trueLabel = screen.getByText('True');
    const trueRow = trueLabel.parentElement;
    if (!trueRow) throw new Error('Expected a row for the true boolean value');

    expect(screen.getByText('False')).toBeInTheDocument();
    fireEvent.click(
      within(trueRow).getByRole('button', { name: 'Select shape Circle' }),
    );

    const selectFormValue =
      formValueSelector<ReturnType<typeof store.getState>>(formName);
    const dynamic = selectFormValue(
      store.getState(),
      'shape.dynamic',
    ) as ShapeDynamic;

    expect(dynamic).toEqual({
      variable: 'is_person',
      type: 'discrete',
      map: [{ value: true, shape: 'circle' }],
    });
    expect(typeof dynamic.map[0]?.value).toBe('boolean');
  });
});
