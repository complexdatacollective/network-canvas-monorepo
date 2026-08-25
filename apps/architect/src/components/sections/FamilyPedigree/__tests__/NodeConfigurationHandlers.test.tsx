import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// Isolates `handleChangeFields` (NodeConfiguration's replacement for the
// `withHandlers`/`connect` composition): ArchitectField/FieldFields/
// NewVariableWindow are stubbed so only the array field's `onBeforeSave` is
// exercised; `updateVariableAsync`/`createVariableAsync` are faked thunks so
// the codebook write itself is a plain spy.
vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@codaco/fresco-ui/Section', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));
vi.mock('~/components/Form/ArchitectField', () => ({ default: () => null }));
vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));

let capturedOnBeforeSave: ((value: unknown) => unknown) | undefined;
vi.mock('~/components/Form/ArchitectArrayField', () => ({
  default: ({
    onBeforeSave,
  }: {
    onBeforeSave: (value: unknown) => unknown;
  }) => {
    capturedOnBeforeSave = onBeforeSave;
    return <div data-testid="dialog-array-field" />;
  },
}));

const updateVariable = vi.fn((_arg: unknown) => Promise.resolve());
const createVariable = vi.fn((_arg: unknown): Promise<{ variable: string }> =>
  Promise.resolve({ variable: 'created' }),
);
vi.mock('~/ducks/modules/protocol/codebook', () => ({
  updateVariableAsync: (arg: unknown) => () => updateVariable(arg),
  createVariableAsync: (arg: unknown) => () => ({
    unwrap: () => createVariable(arg),
  }),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import NodeConfiguration from '../NodeConfiguration';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        v1: {
          component: 'Text',
          type: 'text',
          name: 'secret',
          encrypted: true,
          readOnly: true,
        },
      },
    },
  },
};

const renderSection = (): ((value: unknown) => unknown) => {
  capturedOnBeforeSave = undefined;
  updateVariable.mockClear();
  createVariable.mockClear();

  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = {
          present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] },
        },
      ) => state,
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={
            {
              id: 's1',
              type: 'FamilyPedigree',
              nodeConfig: { type: 'person' },
            } as unknown as Stage
          }
          stageId="s1"
          formId="edit-stage"
        >
          <NodeConfiguration
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  expect(screen.getByTestId('dialog-array-field')).toBeInTheDocument();
  const onBeforeSave = capturedOnBeforeSave;
  if (!onBeforeSave) {
    throw new Error('onBeforeSave was not captured');
  }
  return onBeforeSave;
};

describe('FamilyPedigree NodeConfiguration handleChangeFields', () => {
  beforeEach(() => {
    updateVariable.mockReset();
    updateVariable.mockReturnValue(Promise.resolve());
    createVariable.mockReset();
  });

  it('does not claim readOnly, so a pedigree-owned option set survives a field edit', async () => {
    const onBeforeSave = renderSection();

    await onBeforeSave({ variable: 'v1', component: 'Text', label: 'x' });

    expect(updateVariable).toHaveBeenCalledTimes(1);
    const arg = updateVariable.mock.calls[0]![0] as {
      replaceProperties: readonly string[];
    };
    expect(arg.replaceProperties).toEqual([
      'options',
      'parameters',
      'component',
      'validation',
    ]);
    expect(arg.replaceProperties).not.toContain('readOnly');
    expect(arg.replaceProperties).not.toContain('encrypted');
  });

  it('reports "Variable not found" instead of writing, for an unknown variable', async () => {
    const onBeforeSave = renderSection();

    const result = await onBeforeSave({
      variable: 'missing',
      component: 'Text',
    });

    expect(updateVariable).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      formErrors: ['Attribute not found'],
    });
  });

  it('surfaces a friendly error (not a TypeError) when variable creation rejects', async () => {
    createVariable.mockReturnValue(
      Promise.reject(new Error('Variable name contains no valid characters')),
    );
    const onBeforeSave = renderSection();

    let result: unknown;
    await waitFor(async () => {
      result = await onBeforeSave({
        _createNewVariable: '...',
        component: 'Text',
      });
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        variable: ['Variable name contains no valid characters'],
      },
    });
  });
});
