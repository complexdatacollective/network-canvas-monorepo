import { render, waitFor } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// connect() becomes a pass-through HOC that injects controlled dispatch/state
// props so the composed handler runs without a live store.
const stubProps: Record<string, unknown> = {};
const noop = () => undefined;
vi.mock('react-redux', () => {
  const useDispatch = Object.assign(() => noop, {
    withTypes: () => () => noop,
  });
  const useSelector = Object.assign(() => undefined, {
    withTypes: () => () => undefined,
  });
  return {
    useDispatch,
    useSelector,
    connect:
      () =>
      (Component: React.ComponentType<Record<string, unknown>>) =>
      (ownProps: Record<string, unknown>) =>
        createElement(Component, { ...stubProps, ...ownProps }),
  };
});

import withFormHandlers from '../withFormHandlers';

type Handler = (values: Record<string, unknown>) => Promise<unknown>;

let capturedHandler: Handler;
const Probe = ({ handleChangeFields }: { handleChangeFields: Handler }) => {
  capturedHandler = handleChangeFields;
  return null;
};

const Wrapped: ComponentType<Record<string, unknown>> = withFormHandlers(
  Probe as never,
);

type UpdateVariableArg = {
  merge: boolean;
  configuration: { encrypted?: boolean };
};
const updateVariable = vi.fn((_arg: UpdateVariableArg) => ({
  unwrap: () => Promise.resolve({}),
}));
const createVariable = vi.fn();
const changeForm = vi.fn();
const getVariable = vi.fn();

beforeEach(() => {
  updateVariable.mockReset();
  updateVariable.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  createVariable.mockReset();
  changeForm.mockReset();
  getVariable.mockReset();
  Object.assign(stubProps, {
    updateVariable,
    createVariable,
    changeForm,
    getVariable,
  });
});

const renderHandler = () =>
  render(<Wrapped type="person" entity="node" form="edit-stage" />);

describe('withFormHandlers', () => {
  it('preserves the encrypted flag when saving a field edit (merge:false)', async () => {
    getVariable.mockReturnValue({
      component: 'Text',
      type: 'text',
      name: 'secret',
      encrypted: true,
    });
    renderHandler();

    await capturedHandler({ variable: 'v1', component: 'Text', label: 'x' });

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
    renderHandler();

    let thrown: unknown;
    await waitFor(async () => {
      try {
        await capturedHandler({ _createNewVariable: '...', component: 'Text' });
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
