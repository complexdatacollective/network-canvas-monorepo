import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { messageSubmissionResult } from '~/test/messageText';

type UpdateVariableArg = {
  replaceProperties: readonly string[];
  configuration: Record<string, unknown>;
};

const updateVariableAsync = vi.fn((arg: UpdateVariableArg) => ({
  type: 'updateVariable',
  arg,
}));
const createVariableAsync = vi.fn(
  (arg: { configuration: Record<string, unknown> }) => ({
    type: 'createVariable',
    arg,
  }),
);
vi.mock('~/ducks/modules/protocol/codebook', () => ({
  updateVariableAsync: (arg: UpdateVariableArg) => updateVariableAsync(arg),
  createVariableAsync: (arg: { configuration: Record<string, unknown> }) =>
    createVariableAsync(arg),
}));

let existingVariable: Record<string, unknown> | undefined;
vi.mock('~/selectors/codebook', () => ({
  makeGetVariable: () => () => existingVariable,
}));

let createResult: { unwrap: () => Promise<{ variable: string }> };
const dispatch = vi.fn((action: unknown) => {
  const type = (action as { type?: string }).type;
  if (type === 'createVariable') return createResult;
  return Promise.resolve(action);
});
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatch,
}));

import { useComposerFieldCommit, useFormFieldCommit } from '../fieldCommit';

// `useStore` is the only real react-redux hook these use; the codebook read it
// backs is mocked above, so a bare store is enough to satisfy the context.
const store = {
  getState: () => ({}),
  dispatch,
  subscribe: () => () => undefined,
  replaceReducer: () => undefined,
  [Symbol.observable]: () => ({
    subscribe: () => ({ unsubscribe: () => undefined }),
  }),
};

const wrapper = ({ children }: { children: ReactNode }) => (
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  <Provider store={store as never}>{children}</Provider>
);

const renderCommit = (
  useCommit: typeof useFormFieldCommit | typeof useComposerFieldCommit,
) =>
  renderHook(() => useCommit({ entity: 'node', type: 'person' }), { wrapper })
    .result.current;

beforeEach(() => {
  updateVariableAsync.mockClear();
  createVariableAsync.mockClear();
  dispatch.mockClear();
  existingVariable = { component: 'Text', type: 'text', name: 'secret' };
  createResult = { unwrap: () => Promise.resolve({ variable: 'new-v' }) };
});

describe('useFormFieldCommit', () => {
  it('only claims the codebook properties it edits, leaving protection flags to the reducer', async () => {
    const commit = renderCommit(useFormFieldCommit);

    await commit({ variable: 'v1', component: 'Text', label: 'x' });

    expect(updateVariableAsync).toHaveBeenCalledTimes(1);
    const arg = updateVariableAsync.mock.calls[0]![0];
    expect(arg.replaceProperties).toEqual([
      'options',
      'parameters',
      'component',
      'validation',
    ]);
    expect(arg.replaceProperties).not.toContain('encrypted');
    expect(arg.replaceProperties).not.toContain('readOnly');
  });

  // The dialog merges its values over the row, which arrives already merged
  // with the codebook variable — so a property the chosen control cannot carry
  // has to be cleared explicitly or the codebook keeps its stale value.
  it('clears options the chosen input control cannot carry', async () => {
    const commit = renderCommit(useFormFieldCommit);

    await commit({
      variable: 'v1',
      component: 'Toggle',
      options: [{ label: 'Yes', value: true }],
    });

    const arg = updateVariableAsync.mock.calls[0]![0];
    expect(arg.configuration.options).toBeUndefined();
  });

  it('keeps options a categorical control does carry', async () => {
    existingVariable = { type: 'categorical', name: 'colour' };
    const commit = renderCommit(useFormFieldCommit);

    await commit({
      variable: 'v1',
      component: 'RadioGroup',
      options: [{ label: 'Red', value: 'red' }],
    });

    const arg = updateVariableAsync.mock.calls[0]![0];
    expect(arg.configuration.options).toEqual([{ label: 'Red', value: 'red' }]);
  });

  it('surfaces a friendly error (not a TypeError) when variable creation rejects', async () => {
    createResult = {
      unwrap: () =>
        Promise.reject(new Error('Variable name contains no valid characters')),
    };
    const commit = renderCommit(useFormFieldCommit);

    const result = await commit({
      _createNewVariable: '...',
      component: 'Text',
    });

    expect(messageSubmissionResult(result)).toEqual({
      success: false,
      fieldErrors: {
        variable: [
          'These changes could not be saved. Check the current settings and try again.',
        ],
      },
    });
  });

  it('reports a missing variable as a failed submission instead of throwing', async () => {
    existingVariable = undefined;
    const commit = renderCommit(useFormFieldCommit);

    const result = await commit({ variable: 'gone', component: 'Text' });

    expect(messageSubmissionResult(result)).toEqual({
      success: false,
      formErrors: ['Attribute not found'],
    });
  });

  // A save that cannot resolve its variable must leave the codebook alone, so
  // that a stage with no real edit stays clean and discards without prompting.
  it('writes nothing when the row points at a missing variable', async () => {
    existingVariable = undefined;
    const commit = renderCommit(useFormFieldCommit);

    await commit({ variable: 'gone', component: 'Text' });

    expect(updateVariableAsync).not.toHaveBeenCalled();
    expect(createVariableAsync).not.toHaveBeenCalled();
  });
});

describe('useComposerFieldCommit', () => {
  it('only claims options and validation, so the codebook keeps every property the composer does not own', async () => {
    const commit = renderCommit(useComposerFieldCommit);

    const saved = await commit({
      variable: 'v1',
      component: 'TextArea',
      label: 'x',
    });

    expect(updateVariableAsync).toHaveBeenCalledTimes(1);
    const arg = updateVariableAsync.mock.calls[0]![0];
    expect(arg.replaceProperties).toEqual(['options', 'validation']);
    expect(arg.configuration).not.toHaveProperty('component');
    // component and parameters stay on the composer field
    expect(saved).toMatchObject({ variable: 'v1', component: 'TextArea' });
  });

  it('seeds component on a variable it creates, so a form field can reference it later', async () => {
    const commit = renderCommit(useComposerFieldCommit);

    await commit({ _createNewVariable: 'age', component: 'Number' });

    expect(createVariableAsync).toHaveBeenCalledTimes(1);
    const arg = createVariableAsync.mock.calls[0]![0];
    expect(arg.configuration).toMatchObject({
      name: 'age',
      type: 'number',
      component: 'Number',
    });
  });

  it('surfaces a friendly error (not a TypeError) when variable creation rejects', async () => {
    createResult = {
      unwrap: () =>
        Promise.reject(new Error('Variable name contains no valid characters')),
    };
    const commit = renderCommit(useComposerFieldCommit);

    const result = await commit({
      _createNewVariable: '...',
      component: 'Text',
    });

    expect(messageSubmissionResult(result)).toEqual({
      success: false,
      fieldErrors: {
        variable: [
          'These changes could not be saved. Check the current settings and try again.',
        ],
      },
    });
  });

  it('writes nothing when the row points at a missing variable', async () => {
    existingVariable = undefined;
    const commit = renderCommit(useComposerFieldCommit);

    await commit({ variable: 'gone', component: 'Text' });

    expect(updateVariableAsync).not.toHaveBeenCalled();
    expect(createVariableAsync).not.toHaveBeenCalled();
  });
});
