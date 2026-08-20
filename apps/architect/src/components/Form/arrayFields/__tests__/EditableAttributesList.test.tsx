import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import { useStageFormValues } from '~/components/StageEditor/useStageFormValues';
import type * as SelectorsIndexes from '~/selectors/indexes';

const codebookVariables = {
  close: { name: 'close', type: 'boolean', component: 'Boolean' },
  nearby: { name: 'nearby', type: 'boolean', component: 'Boolean' },
};

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubject: () => codebookVariables,
  getVariablesForSubjectSelector: () => codebookVariables,
  EMPTY_VARIABLES: {},
}));

vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => ({ stages: [] }),
}));

vi.mock('~/selectors/indexes', async (importOriginal) => {
  const actual = await importOriginal<typeof SelectorsIndexes>();
  return { ...actual, getVariableRoleMap: () => ({}) };
});

// The real editor is a full variable/component/parameters form. Standing a
// probe in its place is what makes the cross-store read observable: it renders
// INSIDE the row dialog's own FormStoreProvider, where `useFormValue` would
// address the dialog's form rather than the stage's.
vi.mock('~/components/EditableAttributesList/ComposerAttributeFields', () => {
  const paths = ['nodeForm.fields'] as const;

  const StageValuesProbe = ({ variable }: { variable?: string }) => {
    const fields = useStageFormValues(paths)['nodeForm.fields'];
    return (
      <div>
        <span data-testid="editing-variable">{variable ?? 'none'}</span>
        <span data-testid="stage-field-count">
          {Array.isArray(fields) ? fields.length : -1}
        </span>
      </div>
    );
  };

  return {
    COMPOSER_CONTRADICTION_FIELD: '_contradiction',
    default: StageValuesProbe,
  };
});

import EditableAttributesList from '../EditableAttributesList';

const COMMITTED_STAGE = asStage({
  id: 'stage-1',
  nodeForm: {
    fields: [
      { id: 'field-1', variable: 'close', component: 'Boolean' },
      { id: 'field-2', variable: 'nearby', component: 'Boolean' },
    ],
  },
});

const setup = (handleChangeFields = vi.fn((value: unknown) => value)) => {
  const view = renderStageForm({
    committedStage: COMMITTED_STAGE,
    children: (
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        addButtonLabel="Create new node attribute"
        handleChangeFields={handleChangeFields}
      />
    ),
  });

  const getFields = () =>
    (view.getFormValues() as { nodeForm?: { fields?: unknown[] } }).nodeForm
      ?.fields ?? [];

  return { ...view, getFields, handleChangeFields };
};

describe('EditableAttributesList', () => {
  it('seeds the list from the committed stage as one opaque field', async () => {
    const { getFields, getStoreApi } = setup();

    await waitFor(() => expect(getFields()).toHaveLength(2));
    expect([...getStoreApi().getState().fields.keys()]).toEqual([
      'nodeForm.fields',
    ]);
  });

  it('reads the stage form from inside the row dialog’s own form store', async () => {
    setup();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit attribute' })[0]!,
    );

    expect(await screen.findByTestId('stage-field-count')).toHaveTextContent(
      '2',
    );
    expect(screen.getByTestId('editing-variable')).toHaveTextContent('close');
  });

  it('removes an attribute and snapshots the whole array', async () => {
    const { getFields, getHistory, snapshots } = setup();

    await waitFor(() => expect(getFields()).toHaveLength(2));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove attribute' })[1]!,
    );

    await waitFor(() => expect(getFields()).toHaveLength(1));
    expect(snapshots.at(-1)).toMatchObject({
      nodeForm: { fields: [expect.objectContaining({ id: 'field-1' })] },
    });
    expect(getHistory().canUndo).toBe(true);
  });
});

const EDGE_FIELDS = [
  { id: 'field-1', variable: 'close', component: 'Boolean' },
  { id: 'field-2', variable: 'nearby', component: 'Boolean' },
];

const setupControlled = () => {
  const onChange = vi.fn();
  const view = renderStageForm({
    committedStage: asStage({
      id: 'stage-1',
      edges: [
        {
          id: 'edge-1',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: EDGE_FIELDS },
        },
      ],
    }),
    children: (
      <EditableAttributesList
        fieldName="edges[0].form.fields"
        entity="edge"
        type="knows"
        addButtonLabel="Create new attribute for Knows"
        handleChangeFields={vi.fn((value: unknown) => value)}
        value={EDGE_FIELDS}
        onChange={onChange}
      />
    ),
  });

  return { ...view, onChange };
};

describe('EditableAttributesList controlled by its owner', () => {
  it('registers nothing and contributes nothing to the form’s output', async () => {
    const { getStoreApi, getFormValues } = setupControlled();

    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Edit attribute' }),
      ).toHaveLength(2),
    );

    // The owner (`EdgeConfiguration`'s `edges` field) holds this array inside
    // its own value. A field registered here as well would be a positional
    // name over a deletable list, which is the resurrection hazard
    // `ArchitectArrayField` documents — and `getFormValues()` would replay it
    // over the owner's copy.
    expect([...getStoreApi().getState().fields.keys()]).toEqual([]);
    expect(getFormValues()).toEqual({});
  });

  it('reports a removal to its owner instead of writing the form store', async () => {
    const { getStoreApi, onChange } = setupControlled();

    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Remove attribute' }),
      ).toHaveLength(2),
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove attribute' })[1]!,
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'field-1' }),
      ]),
    );
    expect(getStoreApi().getState().fields.size).toBe(0);
    expect(getStoreApi().getState().dormantValues.size).toBe(0);
  });
});
