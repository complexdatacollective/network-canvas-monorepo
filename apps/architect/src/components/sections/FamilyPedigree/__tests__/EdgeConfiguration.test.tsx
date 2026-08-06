import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage, VariableOptions } from '@codaco/protocol-validation';
import {
  RELATIONSHIP_TYPE_OPTIONS,
  RELATIONSHIP_TYPES,
} from '@codaco/shared-consts';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';
import { optionsMatch } from '~/utils/variables';

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

  it('matches a categorical variable carrying exactly the interview values', () => {
    const variableOptions: VariableOptions = RELATIONSHIP_TYPE_OPTIONS.map(
      ({ value, label }) => ({ value, label }),
    );

    expect(optionsMatch(variableOptions, RELATIONSHIP_TYPE_OPTIONS)).toBe(true);
  });
});

const CODEBOOK = {
  edge: {
    partner: {
      name: 'Partner',
      color: 'e',
      variables: {
        relVar: { name: 'Relationship', type: 'text' },
        activeVar: { name: 'Active', type: 'boolean' },
        gcVar: { name: 'Gestational Carrier', type: 'boolean' },
        gameteVar: { name: 'Gamete Role', type: 'text' },
      },
    },
    marriage: { name: 'Marriage', color: 'm', variables: {} },
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
});
