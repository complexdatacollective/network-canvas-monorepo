import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { reducer as formReducer, reduxForm } from 'redux-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The heavy editor chrome is stubbed the way ComposerAttributeFields' test
// stubs it; what matters here is the props FieldFields hands ValidationSection,
// which the stub below surfaces as a data attribute.
vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => (
    <div data-testid="section">{children}</div>
  ),
  Subsection: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`field-${name}`} />
  ),
}));
vi.mock('~/components/Form/Fields/RichText/Field', () => ({
  default: () => <div data-testid="rich-text" />,
}));
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => <div data-testid="variable-picker" />,
}));
vi.mock('~/components/Form/Fields/InputPreview', () => ({
  default: () => <div data-testid="input-preview" />,
}));
vi.mock('~/components/Options', () => ({
  default: () => <div data-testid="options" />,
}));
vi.mock('~/components/Parameters', () => ({
  default: () => <div data-testid="parameters" />,
}));
vi.mock('~/components/BooleanChoice', () => ({
  default: () => <div data-testid="boolean-choice" />,
}));
vi.mock('~/components/ExternalLink', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// Surfaces the identity the ROW-level contradiction check is given.
vi.mock('~/components/sections/ValidationSection', () => ({
  default: ({ currentVariableId }: { currentVariableId: string }) => (
    <div
      data-testid="validation-section"
      data-current-variable-id={currentVariableId}
    />
  ),
}));

const fieldHandlers = {
  variable: 'age',
  variableType: 'number',
  isNewVariable: false,
  variableOptions: [],
  component: 'Number',
  componentOptions: [],
  metaForType: { label: 'Number' },
  existingVariables: {},
  handleNewVariable: vi.fn(),
  handleChangeVariable: vi.fn(),
  handleChangeComponent: vi.fn(),
};
vi.mock('../withFieldsHandlers', () => ({
  useFieldHandlers: () => fieldHandlers,
}));

import FieldFields from '../FieldFields';

const FORM = 'field-fields-test';

const Harness = reduxForm({ form: FORM })(() => (
  <FieldFields form={FORM} entity="node" type="person" />
));

const renderFields = () => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  );
};

const currentVariableId = () =>
  screen
    .getByTestId('validation-section')
    .getAttribute('data-current-variable-id');

beforeEach(() => {
  fieldHandlers.variable = 'age';
  fieldHandlers.isNewVariable = false;
});

// Audit sweep: creating a variable writes the typed DISPLAY NAME into
// `variable` as well as `_createNewVariable` (withFieldsHandlers'
// `handleNewVariable`), so a non-empty `variable` is not necessarily a
// committed codebook id. The form-level validator was taught this in
// 02f3e9cbe; the row-level check kept the conflation, so a typed name matching
// a real codebook id let the row OFFER a reference rule the dialog then
// rejected on save.
describe('FieldFields validation identity', () => {
  it('passes an empty id for a variable that does not exist yet', () => {
    fieldHandlers.isNewVariable = true;
    renderFields();

    expect(currentVariableId()).toBe('');
  });

  it('passes the codebook id for an existing variable', () => {
    renderFields();

    expect(currentVariableId()).toBe('age');
  });
});
