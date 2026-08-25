import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
  type Stage,
  type VariableOptions,
} from '@codaco/protocol-validation';
import {
  RELATIONSHIP_TYPE_OPTIONS,
  RELATIONSHIP_TYPES,
} from '@codaco/shared-consts';
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

// The dialog EdgeConfiguration opens for "create a new variable" — irrelevant
// to the reset-on-type-change behaviour below.
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import EdgeConfiguration from '../EdgeConfiguration';

describe('EdgeConfiguration RELATIONSHIP_TYPE_OPTIONS', () => {
  it('locks the option set to the shared canonical relationship types', () => {
    expect(RELATIONSHIP_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      ...RELATIONSHIP_TYPES,
    ]);
  });

  // Asked through the protocol schema's own comparison, so the picker cannot
  // offer a variable the validator then rejects — and vice versa.
  it('matches a categorical variable carrying exactly the interview values', () => {
    const variableOptions: VariableOptions = RELATIONSHIP_TYPE_OPTIONS.map(
      ({ value, label }) => ({ value, label }),
    );

    expect(
      optionsMatchInterfaceOwnedSet(
        variableOptions,
        INTERFACE_OWNED_OPTION_SETS.relationshipType.options,
      ),
    ).toBe(true);
  });
});

const CODEBOOK = {
  edge: {
    partner: {
      name: 'Partner',
      color: 'edge-color-seq-1',
      variables: {
        relVar: { name: 'Relationship', type: 'text' },
        activeVar: { name: 'Active', type: 'boolean' },
        gcVar: { name: 'Gestational Carrier', type: 'boolean' },
        gameteVar: { name: 'Gamete Role', type: 'text' },
      },
    },
    marriage: {
      name: 'Marriage',
      color: 'edge-color-seq-2',
      variables: {},
    },
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
          <EdgeConfiguration
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
    setEdgeType: (value: string) => {
      act(() => {
        getContext()
          .storeApi.getState()
          .setFieldValue('edgeConfig.type', value);
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

// Regression: the four dependent variable slots must be dropped when the
// edge type changes, both currently-registered (VariableRow stays mounted
// across the change) and any dormant leftover — closed bug "FamilyPedigree
// edge-type change keeps the old type's variable references".
describe('EdgeConfiguration edge-type change', () => {
  const COMMITTED_EDGE_CONFIG = {
    edgeConfig: {
      type: 'partner',
      relationshipTypeVariable: 'relVar',
      isActiveVariable: 'activeVar',
      isGestationalCarrierVariable: 'gcVar',
      gameteRoleVariable: 'gameteVar',
    },
  };

  it('clears all four dependent variable slots when the edge type changes', () => {
    const view = renderComponent(COMMITTED_EDGE_CONFIG);

    view.setEdgeType('marriage');

    expect(
      view.getFieldValue('edgeConfig.relationshipTypeVariable'),
    ).toBeUndefined();
    expect(view.getFieldValue('edgeConfig.isActiveVariable')).toBeUndefined();
    expect(
      view.getFieldValue('edgeConfig.isGestationalCarrierVariable'),
    ).toBeUndefined();
    expect(view.getFieldValue('edgeConfig.gameteRoleVariable')).toBeUndefined();
  });

  it('does not resurrect the old references after the fields remount for the new type', () => {
    const view = renderComponent(COMMITTED_EDGE_CONFIG);

    view.setEdgeType('marriage');
    // Switch back to a type sharing no committed data of its own: if the
    // reset only cleared the *registered* field and left a dormant leftover,
    // this remount would resurrect `relVar` via the dormant-restore path.
    view.setEdgeType('partner');

    expect(
      view.getFieldValue('edgeConfig.relationshipTypeVariable'),
    ).toBeUndefined();
  });

  it('does not clear the slots when the same edge type is reselected', () => {
    const view = renderComponent(COMMITTED_EDGE_CONFIG);

    view.setEdgeType('partner');

    expect(view.getFieldValue('edgeConfig.relationshipTypeVariable')).toBe(
      'relVar',
    );
  });

  it('does not clear anything on the initial mount-time resolution', () => {
    const view = renderComponent(COMMITTED_EDGE_CONFIG);

    expect(view.getFieldValue('edgeConfig.relationshipTypeVariable')).toBe(
      'relVar',
    );
  });

  describe('undo', () => {
    const PARTNER_CONFIG = {
      'edgeConfig.type': 'partner',
      'edgeConfig.relationshipTypeVariable': 'relVar',
      'edgeConfig.isActiveVariable': 'activeVar',
      'edgeConfig.isGestationalCarrierVariable': 'gcVar',
      'edgeConfig.gameteRoleVariable': 'gameteVar',
    };

    it('keeps the variable slots an undo restored alongside the edge type', () => {
      const view = renderComponent(COMMITTED_EDGE_CONFIG);

      view.setEdgeType('marriage');
      expect(
        view.getFieldValue('edgeConfig.relationshipTypeVariable'),
      ).toBeUndefined();

      view.restore(PARTNER_CONFIG);

      expect(view.getFieldValue('edgeConfig.type')).toBe('partner');
      // The restore brought the partner slots back with the edge type;
      // observing the restored type as "a change" must not clear them again.
      expect(view.getFieldValue('edgeConfig.relationshipTypeVariable')).toBe(
        'relVar',
      );
      expect(view.getFieldValue('edgeConfig.isActiveVariable')).toBe(
        'activeVar',
      );
      expect(
        view.getFieldValue('edgeConfig.isGestationalCarrierVariable'),
      ).toBe('gcVar');
      expect(view.getFieldValue('edgeConfig.gameteRoleVariable')).toBe(
        'gameteVar',
      );
    });

    it('still clears the slots on a user edit that follows a restore', () => {
      const view = renderComponent(COMMITTED_EDGE_CONFIG);

      view.setEdgeType('marriage');
      view.restore(PARTNER_CONFIG);
      view.setEdgeType('marriage');

      expect(
        view.getFieldValue('edgeConfig.relationshipTypeVariable'),
      ).toBeUndefined();
      expect(
        view.getFieldValue('edgeConfig.gameteRoleVariable'),
      ).toBeUndefined();
    });

    it('still clears the slots on a user edit after a restore that left the edge type alone', () => {
      const view = renderComponent(COMMITTED_EDGE_CONFIG);

      // A restore of some other field bumps the same counter, so the guard has
      // to be consumed even when `edgeConfig.type` did not move.
      view.restore({ 'edgeConfig.isActiveVariable': 'activeVar' });
      view.setEdgeType('marriage');

      expect(
        view.getFieldValue('edgeConfig.relationshipTypeVariable'),
      ).toBeUndefined();
    });
  });

  // The same reset-loop shape as NodeConfiguration, held to the same
  // guarantee. All four slots happen to be scalars today, so the loop
  // debounces into a single entry by luck rather than by design; giving one
  // an array value would have started pushing half-cleared stops.
  describe('timeline', () => {
    const renderPedigree = () =>
      renderStageForm({
        committedStage: asStage({
          id: 's1',
          type: 'FamilyPedigree',
          ...COMMITTED_EDGE_CONFIG,
        }),
        extraReducers: {
          activeProtocol: (
            state = {
              present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] },
            },
          ) => state,
        },
        children: (
          <EdgeConfiguration
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        ),
      });

    const setEdgeType = (
      view: ReturnType<typeof renderPedigree>,
      value: string,
    ) => {
      act(() => {
        view.getStoreApi().getState().setFieldValue('edgeConfig.type', value);
      });
    };

    /** Past the leaf debounce, so a trailing entry would have landed. */
    const settle = async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
    };

    it('records the edge-type change and every slot clear as one entry', async () => {
      const view = renderPedigree();

      setEdgeType(view, 'marriage');

      // A discrete gesture, not typing: the entry lands with it rather than
      // waiting out the leaf debounce the last clear happened to arm, so undo
      // is available the moment the reset is on screen.
      expect(view.snapshots).toHaveLength(1);

      await settle();

      expect(view.snapshots).toHaveLength(1);
      expect(view.getPresent()).toEqual({ edgeConfig: { type: 'marriage' } });
    });

    it('takes the edge-type change back in one undo, and redoes it whole', async () => {
      const view = renderPedigree();

      setEdgeType(view, 'marriage');
      await settle();

      act(() => {
        view.getHistory().undo();
      });

      expect(view.getFieldState('edgeConfig.type')?.value).toBe('partner');
      expect(
        view.getFieldState('edgeConfig.relationshipTypeVariable')?.value,
      ).toBe('relVar');
      expect(view.getFieldState('edgeConfig.gameteRoleVariable')?.value).toBe(
        'gameteVar',
      );
      expect(view.store.getState().stageEditorDraft.history.past).toHaveLength(
        0,
      );

      act(() => {
        view.getHistory().redo();
      });

      expect(view.getFieldState('edgeConfig.type')?.value).toBe('marriage');
      expect(
        view.getFieldState('edgeConfig.relationshipTypeVariable')?.value,
      ).toBeUndefined();
      expect(view.snapshots).toHaveLength(1);
      expect(
        view.store.getState().stageEditorDraft.history.future,
      ).toHaveLength(0);
      expect(view.getHistory().canUndo).toBe(true);
    });
  });
});
