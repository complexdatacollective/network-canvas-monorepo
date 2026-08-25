import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// Neither the "create a new variable" dialog nor `FieldFields` (the Form
// Fields row editor, which transitively imports `~/components/Validations`)
// is exercised by the reset behaviour below.
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));
vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import NodeConfiguration from '../NodeConfiguration';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        labelVar: { name: 'Label', type: 'text' },
        egoVar: { name: 'Ego', type: 'boolean' },
        relVar: { name: 'Relationship', type: 'text' },
        sexVar: {
          name: 'Sex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
      },
    },
    other: { name: 'Other', color: 'd', variables: {} },
  },
};

const renderComponent = (committedStage: Record<string, unknown>) => {
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

  let context: StageFormContextValue | null = null;
  const Probe = () => {
    context = useStageFormContext();
    return null;
  };

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={
            {
              id: 's1',
              type: 'FamilyPedigree',
              ...committedStage,
            } as unknown as Stage
          }
          stageId="s1"
          formId="edit-stage"
        >
          <Probe />
          <NodeConfiguration
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  const getContext = (): StageFormContextValue => {
    if (!context) throw new Error('stage form context was not captured');
    return context;
  };

  return {
    setNodeType: (value: string) => {
      act(() => {
        getContext()
          .storeApi.getState()
          .setFieldValue('nodeConfig.type', value);
      });
    },
    // Simulates a value the sibling EdgeConfiguration/FramingConfig/etc.
    // sections would have registered had they been mounted alongside
    // NodeConfiguration in the real stage editor — NodeConfiguration alone
    // never registers these, so `committedStage` data for them is otherwise
    // unreachable through `getFieldState`.
    seedDormantValue: (name: string, value: string) => {
      act(() => {
        getContext().storeApi.getState().setFieldValue(name, value);
      });
    },
    getFieldValue: (name: string) =>
      getContext().storeApi.getState().getFieldState(name)?.value,
    /**
     * Stands in for `useStageDraftHistory`, whose `applyDiff` writes every
     * field named in the timeline snapshot inside a single `runRestore`.
     */
    restore: (values: Record<string, unknown>) => {
      act(() => {
        getContext().draft.runRestore(() => {
          const { setFieldValue } = getContext().storeApi.getState();
          for (const [name, value] of Object.entries(values)) {
            setFieldValue(name, value as never);
          }
        });
      });
    },
  };
};

const COMMITTED_NODE_CONFIG = {
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'labelVar',
    egoVariable: 'egoVar',
    relationshipVariable: 'relVar',
    biologicalSexVariable: 'sexVar',
    form: [{ id: 'f1', variable: 'labelVar', prompt: 'P' }],
  },
};

const COMMITTED_NODE_CONFIG_WITHOUT_FORM = {
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'labelVar',
    egoVariable: 'egoVar',
    relationshipVariable: 'relVar',
    biologicalSexVariable: 'sexVar',
  },
};

describe('NodeConfiguration optional form', () => {
  it('starts collapsed when no form is configured and initializes an empty form when enabled', async () => {
    const view = renderComponent(COMMITTED_NODE_CONFIG_WITHOUT_FORM);
    const toggle = screen.getByRole('switch', {
      name: 'Form configuration',
    });

    expect(toggle).not.toBeChecked();
    expect(view.getFieldValue('nodeConfig.form')).toBeUndefined();

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    await waitFor(() =>
      expect(view.getFieldValue('nodeConfig.form')).toEqual([]),
    );
  });

  it('starts expanded for a configured form and discards it when turned off', async () => {
    const view = renderComponent(COMMITTED_NODE_CONFIG);
    const toggle = screen.getByRole('switch', {
      name: 'Form configuration',
    });

    expect(toggle).toBeChecked();
    expect(view.getFieldValue('nodeConfig.form')).toEqual(
      COMMITTED_NODE_CONFIG.nodeConfig.form,
    );

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    await waitFor(() =>
      expect(view.getFieldValue('nodeConfig.form')).toBeUndefined(),
    );

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(view.getFieldValue('nodeConfig.form')).toBeUndefined();
  });
});

// Regression: `nodeConfig` is a CONTAINER key with real leaves nested under
// it (`nodeConfig.nodeLabelVariable` etc.) — clearing the container key
// itself (as the assembled-object top-level-keys reset originally did) never
// reaches those registered leaves and silently no-ops.
describe('NodeConfiguration node-type change', () => {
  it('clears the four node-attribute slots and the form-fields array when the node type changes', () => {
    const view = renderComponent(COMMITTED_NODE_CONFIG);

    view.setNodeType('other');

    expect(view.getFieldValue('nodeConfig.nodeLabelVariable')).toBeUndefined();
    expect(view.getFieldValue('nodeConfig.egoVariable')).toBeUndefined();
    expect(
      view.getFieldValue('nodeConfig.relationshipVariable'),
    ).toBeUndefined();
    expect(
      view.getFieldValue('nodeConfig.biologicalSexVariable'),
    ).toBeUndefined();
    expect(view.getFieldValue('nodeConfig.form')).toBeUndefined();
  });

  it('preserves the newly-picked node type itself', () => {
    const view = renderComponent(COMMITTED_NODE_CONFIG);

    view.setNodeType('other');

    expect(view.getFieldValue('nodeConfig.type')).toBe('other');
  });

  it('does not resurrect old references after switching back to the original type', () => {
    const view = renderComponent(COMMITTED_NODE_CONFIG);

    view.setNodeType('other');
    view.setNodeType('person');

    expect(view.getFieldValue('nodeConfig.nodeLabelVariable')).toBeUndefined();
    expect(view.getFieldValue('nodeConfig.form')).toBeUndefined();
  });

  it('preserves subject-independent stage config registered by sibling sections', () => {
    // `edgeConfig`/`framing`/`boundaries` must be present in the committed
    // stage for the reset to consider them as reset CANDIDATES at all (so
    // this genuinely exercises the preserve-list, rather than vacuously
    // passing because the key was never a candidate either way) — matching
    // what the real stage editor's sibling EdgeConfiguration/FramingConfig/
    // BoundaryOptions sections would have registered alongside
    // NodeConfiguration. NodeConfiguration alone never mounts them, so their
    // values are seeded as dormant writes (the store's stand-in for "some
    // other mounted Field owns this name").
    const view = renderComponent({
      ...COMMITTED_NODE_CONFIG,
      edgeConfig: { type: 'partner' },
      framing: { mode: 'fixed', value: 'gamete' },
      boundaries: {
        requireGrandparents: 'off',
        requireChildrenContributors: 'off',
      },
    });
    view.seedDormantValue('edgeConfig.type', 'partner');
    view.seedDormantValue('framing.mode', 'fixed');
    view.seedDormantValue('boundaries.requireGrandparents', 'off');

    view.setNodeType('other');

    expect(view.getFieldValue('edgeConfig.type')).toBe('partner');
    expect(view.getFieldValue('framing.mode')).toBe('fixed');
    expect(view.getFieldValue('boundaries.requireGrandparents')).toBe('off');
  });

  it('does not clear anything on the initial mount-time resolution', () => {
    const view = renderComponent(COMMITTED_NODE_CONFIG);

    expect(view.getFieldValue('nodeConfig.nodeLabelVariable')).toBe('labelVar');
  });

  describe('undo', () => {
    const PERSON_CONFIG = {
      'nodeConfig.type': 'person',
      'nodeConfig.nodeLabelVariable': 'labelVar',
      'nodeConfig.egoVariable': 'egoVar',
      'nodeConfig.relationshipVariable': 'relVar',
      'nodeConfig.biologicalSexVariable': 'sexVar',
      'nodeConfig.form': [{ id: 'f1', variable: 'labelVar', prompt: 'P' }],
    };

    it('keeps the configuration an undo restored alongside the node type', () => {
      const view = renderComponent(COMMITTED_NODE_CONFIG);

      view.setNodeType('other');
      expect(
        view.getFieldValue('nodeConfig.nodeLabelVariable'),
      ).toBeUndefined();

      view.restore(PERSON_CONFIG);

      expect(view.getFieldValue('nodeConfig.type')).toBe('person');
      // The restore brought the whole person configuration back with the node
      // type; observing the restored type as "a change" must not wipe it.
      expect(view.getFieldValue('nodeConfig.nodeLabelVariable')).toBe(
        'labelVar',
      );
      expect(view.getFieldValue('nodeConfig.egoVariable')).toBe('egoVar');
      expect(view.getFieldValue('nodeConfig.relationshipVariable')).toBe(
        'relVar',
      );
      expect(view.getFieldValue('nodeConfig.biologicalSexVariable')).toBe(
        'sexVar',
      );
      expect(view.getFieldValue('nodeConfig.form')).toEqual([
        { id: 'f1', variable: 'labelVar', prompt: 'P' },
      ]);
    });

    it('still resets the stage on a user edit that follows a restore', () => {
      const view = renderComponent(COMMITTED_NODE_CONFIG);

      view.setNodeType('other');
      view.restore(PERSON_CONFIG);
      view.setNodeType('other');

      expect(
        view.getFieldValue('nodeConfig.nodeLabelVariable'),
      ).toBeUndefined();
      expect(view.getFieldValue('nodeConfig.form')).toBeUndefined();
      expect(view.getFieldValue('nodeConfig.type')).toBe('other');
    });

    it('still resets the stage on a user edit after a restore that left the node type alone', () => {
      const view = renderComponent(COMMITTED_NODE_CONFIG);

      // A restore of some other field bumps the same counter, so the guard has
      // to be consumed even when `nodeConfig.type` did not move.
      view.restore({ 'nodeConfig.egoVariable': 'egoVar' });
      view.setNodeType('other');

      expect(
        view.getFieldValue('nodeConfig.nodeLabelVariable'),
      ).toBeUndefined();
    });
  });

  // The reset clears `nodeConfig` as a TREE, which reaches `nodeConfig.type`
  // (cleared, then re-seeded after the loop) before `nodeConfig.form` (an
  // array, so it snapshots on the write). Unbatched, one undo therefore landed
  // on a stage with no node type and no configuration at all — the type select
  // blank and every dependent section unmounted — instead of the previous
  // type's setup.
  describe('timeline', () => {
    const renderPedigree = () =>
      renderStageForm({
        committedStage: asStage({
          id: 's1',
          type: 'FamilyPedigree',
          ...COMMITTED_NODE_CONFIG,
        }),
        extraReducers: {
          activeProtocol: (
            state = {
              present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] },
            },
          ) => state,
        },
        children: (
          <NodeConfiguration
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        ),
      });

    const setNodeType = (
      view: ReturnType<typeof renderPedigree>,
      value: string,
    ) => {
      act(() => {
        view.getStoreApi().getState().setFieldValue('nodeConfig.type', value);
      });
    };

    /** Past the leaf debounce, so a trailing entry would have landed. */
    const settle = async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
    };

    it('records the node-type change and the whole reset as one entry', async () => {
      const view = renderPedigree();

      setNodeType(view, 'other');
      await settle();

      expect(view.snapshots).toHaveLength(1);
      // The one stop the gesture leaves behind is coherent: the new type, and
      // nothing of the old type's configuration.
      expect(view.getPresent()).toEqual({ nodeConfig: { type: 'other' } });
    });

    it('takes the node-type change back in one undo, and redoes it whole', async () => {
      const view = renderPedigree();

      setNodeType(view, 'other');
      await settle();

      act(() => {
        view.getHistory().undo();
      });

      expect(view.getFieldState('nodeConfig.type')?.value).toBe('person');
      expect(view.getFieldState('nodeConfig.nodeLabelVariable')?.value).toBe(
        'labelVar',
      );
      expect(view.getFieldState('nodeConfig.egoVariable')?.value).toBe(
        'egoVar',
      );
      expect(view.getFieldState('nodeConfig.form')?.value).toEqual(
        COMMITTED_NODE_CONFIG.nodeConfig.form,
      );
      expect(view.store.getState().stageEditorDraft.history.past).toHaveLength(
        0,
      );

      act(() => {
        view.getHistory().redo();
      });

      expect(view.getFieldState('nodeConfig.type')?.value).toBe('other');
      expect(
        view.getFieldState('nodeConfig.nodeLabelVariable')?.value,
      ).toBeUndefined();
      expect(view.getFieldState('nodeConfig.form')?.value).toBeUndefined();
      expect(view.snapshots).toHaveLength(1);
      expect(
        view.store.getState().stageEditorDraft.history.future,
      ).toHaveLength(0);
      expect(view.getHistory().canUndo).toBe(true);
    });
  });
});
