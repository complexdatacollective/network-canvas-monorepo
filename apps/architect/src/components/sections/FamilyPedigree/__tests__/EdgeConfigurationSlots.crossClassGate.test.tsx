import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
  type Stage,
} from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// Final-review sweep: FamilyPedigree's four edgeConfig slots are UNVALIDATED
// writers, each carrying a picker exclusion (excludeValidatedUses with the
// slot's own draft value as escape) and a field-level `crossClassPick` gate —
// the mirror of NodeConfigurationSlots.crossClassGate.test.tsx on the edge
// subject. There is no intra-draft case here: FamilyPedigree has no validated
// writer on its edge type.
vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

type CapturedField = {
  validation?: Record<string, unknown>;
  options?: unknown;
};
const capturedFields: Record<string, CapturedField | undefined> = {};
vi.mock('~/components/Form/ArchitectField', () => ({
  default: ({
    name,
    validation,
    options,
  }: {
    name: string;
    validation?: Record<string, unknown>;
    options?: unknown;
  }) => {
    capturedFields[name] = { validation, options };
    return <div data-testid={`field-${name}`} />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import EdgeConfiguration from '../EdgeConfiguration';

type SlotValidator = (value: unknown) => string | undefined;

const slotValidatorFor = (fieldName: string): SlotValidator => {
  const validator = capturedFields[fieldName]?.validation?.crossClassPick;
  if (typeof validator !== 'function') {
    throw new Error(`No crossClassPick validator captured for ${fieldName}`);
  }
  return validator as SlotValidator;
};

const slotOptionValuesFor = (fieldName: string): string[] => {
  const options = capturedFields[fieldName]?.options;
  if (!Array.isArray(options)) {
    throw new Error(`No options captured for ${fieldName}`);
  }
  return options.map((option: { value: string }) => option.value);
};

// `usedFlag` is a boolean edge variable an AlterEdgeForm field elsewhere
// collects (validated, stage s1); `freeFlag` has no saved use anywhere — the
// discriminating pair for the boolean slots. `usedRel`/`freeRel` and
// `usedGamete`/`freeGamete` carry the canonical option sets (imported so
// `optionsMatch` genuinely passes) for the categorical slots.
const CODEBOOK = {
  node: {
    person: { name: 'Person', color: 'c', variables: {} },
  },
  edge: {
    partner: {
      name: 'Partner',
      color: 'e',
      variables: {
        usedFlag: { name: 'Used Flag', type: 'boolean' },
        freeFlag: { name: 'Free Flag', type: 'boolean' },
        usedRel: {
          name: 'Used Rel',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        freeRel: {
          name: 'Free Rel',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        usedGamete: {
          name: 'Used Gamete',
          type: 'categorical',
          options: GAMETE_ROLE_OPTIONS,
        },
        freeGamete: {
          name: 'Free Gamete',
          type: 'categorical',
          options: GAMETE_ROLE_OPTIONS,
        },
      },
    },
  },
};

const EDGE_FORM_STAGE = {
  id: 's1',
  type: 'AlterEdgeForm',
  label: 'F',
  subject: { entity: 'edge', type: 'partner' },
  introductionPanel: { title: 'T', text: 'X' },
  form: {
    fields: [
      { variable: 'usedFlag', prompt: 'P' },
      { variable: 'usedRel', prompt: 'Q' },
      { variable: 'usedGamete', prompt: 'R' },
    ],
  },
};

// The same-class control: `freeFlag` written by ANOTHER FamilyPedigree
// stage's edge slot (unvalidated) must never be excluded or rejected here.
const OTHER_PEDIGREE_STAGE = {
  id: 's2',
  type: 'FamilyPedigree',
  label: 'P2',
  edgeConfig: { type: 'partner', isActiveVariable: 'freeFlag' },
};

const protocolWith = (stages: unknown[]) => ({
  schemaVersion: 8,
  codebook: CODEBOOK,
  stages,
});

const renderComponent = ({
  protocol,
  draftEdgeConfig,
  initialEdgeConfig,
}: {
  protocol: unknown;
  draftEdgeConfig?: Record<string, string>;
  initialEdgeConfig?: Record<string, unknown>;
}) => {
  for (const key of Object.keys(capturedFields)) {
    delete capturedFields[key];
  }
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
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
              id: 's2',
              type: 'FamilyPedigree',
              edgeConfig: { type: 'partner', ...initialEdgeConfig },
            } as unknown as Stage
          }
          stageId="s2"
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

  if (draftEdgeConfig && context) {
    const storeApi = (context as StageFormContextValue).storeApi;
    act(() => {
      for (const [field, value] of Object.entries(draftEdgeConfig)) {
        storeApi.getState().setFieldValue(`edgeConfig.${field}`, value);
      }
    });
  }
};

describe('FamilyPedigree EdgeConfiguration slot picker exclusions', () => {
  it('drops a variable a form elsewhere already validates from every slot pool', () => {
    renderComponent({ protocol: protocolWith([EDGE_FORM_STAGE]) });
    expect(
      slotOptionValuesFor('edgeConfig.relationshipTypeVariable'),
    ).not.toContain('usedRel');
    expect(
      slotOptionValuesFor('edgeConfig.relationshipTypeVariable'),
    ).toContain('freeRel');
    expect(slotOptionValuesFor('edgeConfig.isActiveVariable')).not.toContain(
      'usedFlag',
    );
    expect(slotOptionValuesFor('edgeConfig.isActiveVariable')).toContain(
      'freeFlag',
    );
    expect(
      slotOptionValuesFor('edgeConfig.isGestationalCarrierVariable'),
    ).not.toContain('usedFlag');
    expect(slotOptionValuesFor('edgeConfig.gameteRoleVariable')).not.toContain(
      'usedGamete',
    );
    expect(slotOptionValuesFor('edgeConfig.gameteRoleVariable')).toContain(
      'freeGamete',
    );
  });

  it('keeps a variable only an unvalidated writer elsewhere already claims (same class)', () => {
    renderComponent({ protocol: protocolWith([OTHER_PEDIGREE_STAGE]) });
    expect(slotOptionValuesFor('edgeConfig.isActiveVariable')).toContain(
      'freeFlag',
    );
  });

  it('keeps the slot’s own current pick offered even when conflicted', () => {
    renderComponent({
      protocol: protocolWith([EDGE_FORM_STAGE]),
      draftEdgeConfig: { isActiveVariable: 'usedFlag' },
    });
    expect(slotOptionValuesFor('edgeConfig.isActiveVariable')).toContain(
      'usedFlag',
    );
    // The sibling boolean slot escapes only its OWN value.
    expect(
      slotOptionValuesFor('edgeConfig.isGestationalCarrierVariable'),
    ).not.toContain('usedFlag');
  });
});

describe('FamilyPedigree EdgeConfiguration slot cross-class gates', () => {
  it('every slot rejects a pick a form elsewhere already collects, with the mirror message', () => {
    renderComponent({ protocol: protocolWith([EDGE_FORM_STAGE]) });
    expect(
      slotValidatorFor('edgeConfig.relationshipTypeVariable')('usedRel'),
    ).toBe(
      '"Used Rel" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    );
    expect(
      slotValidatorFor('edgeConfig.isActiveVariable')('usedFlag'),
    ).toContain('is collected by a form elsewhere');
    expect(
      slotValidatorFor('edgeConfig.isGestationalCarrierVariable')('usedFlag'),
    ).toContain('is collected by a form elsewhere');
    expect(
      slotValidatorFor('edgeConfig.gameteRoleVariable')('usedGamete'),
    ).toContain('is collected by a form elsewhere');
  });

  it('escapes when the pick equals the slot’s committed value (pre-existing conflict stays saveable)', () => {
    renderComponent({
      protocol: protocolWith([EDGE_FORM_STAGE]),
      initialEdgeConfig: { isActiveVariable: 'usedFlag' },
    });
    expect(
      slotValidatorFor('edgeConfig.isActiveVariable')('usedFlag'),
    ).toBeUndefined();
  });

  it('allows a pick only an unvalidated writer elsewhere already claims (same class)', () => {
    renderComponent({ protocol: protocolWith([OTHER_PEDIGREE_STAGE]) });
    expect(
      slotValidatorFor('edgeConfig.isActiveVariable')('freeFlag'),
    ).toBeUndefined();
  });
});
