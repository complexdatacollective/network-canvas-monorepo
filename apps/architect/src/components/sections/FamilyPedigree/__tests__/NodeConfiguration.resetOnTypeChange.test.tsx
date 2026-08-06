import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';
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
});
