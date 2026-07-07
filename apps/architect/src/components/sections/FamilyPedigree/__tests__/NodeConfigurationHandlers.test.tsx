import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// connect() becomes a pass-through HOC that injects controlled dispatch/state
// props so the composed handler runs without a live store.
const stubProps: Record<string, unknown> = {};
const noop = () => undefined;
vi.mock('react-redux', () => {
  const useDispatch = Object.assign(() => noop, {
    withTypes: () => () => noop,
  });
  return {
    useDispatch,
    useSelector: (selector: (state: unknown) => unknown) => selector({}),
    connect:
      () =>
      (Component: React.ComponentType<Record<string, unknown>>) =>
      (ownProps: Record<string, unknown>) =>
        createElement(Component, { ...stubProps, ...ownProps }),
  };
});

// redux-form selectors: report a node type so the Form Fields EditableList (and
// thus its onChange -> handleChangeFields wiring) renders.
vi.mock('redux-form', () => ({
  formValueSelector: () => () => 'person',
  getFormValues: () => () => ({}),
  change: (form: string, field: string, value: unknown) => ({
    type: 'CHANGE',
    form,
    field,
    value,
  }),
  SubmissionError: class SubmissionError extends Error {
    errors: Record<string, unknown>;
    constructor(errors: Record<string, unknown>) {
      super('SubmissionError');
      this.errors = errors;
    }
  },
}));

vi.mock('~/ducks/hooks', () => ({ useAppDispatch: () => noop }));

vi.mock('~/selectors/codebook', () => ({
  getVariableOptionsForSubject: () => [],
  makeGetVariable: () => () => undefined,
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => null,
}));
vi.mock('~/components/Form/ValidatedField', () => ({ default: () => null }));
vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));
vi.mock(
  '~/components/sections/fields/EntitySelectField/EntitySelectField',
  () => ({
    default: () => null,
  }),
);
vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));
vi.mock('./NodeFormFieldPreview', () => ({ default: () => null }));

// Expose the onChange handler (which calls handleChangeFields) as a button so
// the test can invoke it with a synthetic field-edit payload.
let capturedOnChange: ((value: unknown) => unknown) | undefined;
vi.mock('~/components/EditableList', () => ({
  formName: 'editable-list-form',
  default: ({ onChange }: { onChange: (value: unknown) => unknown }) => {
    capturedOnChange = onChange;
    return <div data-testid="editable-list" />;
  },
}));

import NodeConfiguration from '../NodeConfiguration';

type UpdateVariableArg = {
  merge: boolean;
  configuration: { encrypted?: boolean };
};
const updateVariable = vi.fn((_arg: UpdateVariableArg) => ({
  unwrap: () => Promise.resolve({}),
}));
const createVariable = vi.fn();
const getVariable = vi.fn();
const getNodeType = vi.fn(() => 'person');
const changeForm = vi.fn();

beforeEach(() => {
  updateVariable.mockReset();
  updateVariable.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  createVariable.mockReset();
  getVariable.mockReset();
  changeForm.mockReset();
  capturedOnChange = undefined;
  Object.assign(stubProps, {
    updateVariable,
    createVariable,
    getVariable,
    getNodeType,
    changeForm,
  });
});

const renderSection = () =>
  render(
    <NodeConfiguration
      form="edit-stage"
      stagePath="stages[0]"
      interfaceType={'FamilyPedigreeCensus' as never}
    />,
  );

describe('FamilyPedigree NodeConfiguration handleChangeFields', () => {
  it('preserves the encrypted flag when saving a field edit (merge:false)', async () => {
    getVariable.mockReturnValue({
      component: 'Text',
      type: 'text',
      name: 'secret',
      encrypted: true,
    });
    renderSection();
    expect(screen.getByTestId('editable-list')).toBeInTheDocument();

    await capturedOnChange!({ variable: 'v1', component: 'Text', label: 'x' });

    expect(updateVariable).toHaveBeenCalledTimes(1);
    const arg = updateVariable.mock.calls[0]![0];
    expect(arg.merge).toBe(false);
    expect(arg.configuration.encrypted).toBe(true);
  });

  it('surfaces a friendly error (not a TypeError) when variable creation rejects', async () => {
    createVariable.mockReturnValue({
      unwrap: () =>
        Promise.reject(new Error('Variable name contains no valid characters')),
    });
    renderSection();

    let thrown: unknown;
    await waitFor(async () => {
      try {
        await capturedOnChange!({
          _createNewVariable: '...',
          component: 'Text',
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeDefined();
    });

    const errors = (thrown as { errors: { variable: string } }).errors;
    expect(errors.variable).toBe('Variable name contains no valid characters');
    expect(errors.variable).not.toContain('TypeError');
  });
});
