import { render, waitFor } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Inject controlled dispatch/state props so the handler can be exercised without
// a live store. connect() becomes a pass-through HOC that merges the stub props.
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

import withComposerFormHandlers from '../withComposerFormHandlers';

type Handler = (values: Record<string, unknown>) => Promise<unknown>;

let capturedHandler: Handler;
const Probe = ({ handleChangeFields }: { handleChangeFields: Handler }) => {
  capturedHandler = handleChangeFields;
  return null;
};

const Wrapped: ComponentType<Record<string, unknown>> =
  withComposerFormHandlers(Probe as never);

type UpdateVariableArg = {
  replaceProperties: readonly string[];
  configuration: Record<string, unknown>;
};
const updateVariable = vi.fn((_arg: UpdateVariableArg) => ({
  unwrap: () => Promise.resolve({}),
}));
type CreateVariableArg = { configuration: Record<string, unknown> };
const createVariable = vi.fn((_arg?: CreateVariableArg) => ({
  unwrap: () => Promise.resolve({ variable: 'new-v' }),
}));
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

describe('withComposerFormHandlers', () => {
  it('only claims options and validation, so the codebook keeps every property the composer does not own', async () => {
    getVariable.mockReturnValue({
      type: 'text',
      name: 'secret',
      component: 'Text',
      encrypted: true,
      readOnly: true,
    });
    renderHandler();

    await capturedHandler({
      variable: 'v1',
      component: 'TextArea',
      label: 'x',
    });

    expect(updateVariable).toHaveBeenCalledTimes(1);
    const arg = updateVariable.mock.calls[0]![0];
    expect(arg.replaceProperties).toEqual(['options', 'validation']);
    expect(arg.replaceProperties).not.toContain('component');
    expect(arg.replaceProperties).not.toContain('encrypted');
    expect(arg.replaceProperties).not.toContain('readOnly');
    expect(arg.configuration).not.toHaveProperty('component');
  });

  it('seeds component on a variable it creates, so a form field can reference it later', async () => {
    renderHandler();

    await capturedHandler({
      _createNewVariable: 'age',
      component: 'Number',
    });

    expect(createVariable).toHaveBeenCalledTimes(1);
    const arg = createVariable.mock.calls[0]![0]!;
    expect(arg.configuration).toMatchObject({
      name: 'age',
      type: 'number',
      component: 'Number',
    });
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
