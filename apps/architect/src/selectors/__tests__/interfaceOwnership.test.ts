import { describe, expect, it } from 'vitest';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';
import type { RootState } from '~/ducks/modules/root';
import {
  getExclusiveVariableSlotMap,
  getInterfaceOwnedOptionMap,
  roleMapKey,
} from '~/selectors/indexes';
import {
  excludeInterfaceOwned,
  interfaceOwnedPickIssue,
} from '~/selectors/roleFilters';

const EGO_SLOT = 'familyPedigree.nodeConfig.egoVariable';

const stateWith = (protocol: unknown): RootState =>
  ({
    activeProtocol: { present: protocol },
    stageEditorDraft: { ui: { liveValues: null } },
  }) as unknown as RootState;

const pedigreeStage = (id: string) => ({
  id,
  type: 'FamilyPedigree',
  label: 'Family Pedigree',
  nodeConfig: {
    type: 'family_member',
    nodeLabelVariable: 'fmName',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationshipToEgo',
    biologicalSexVariable: 'biologicalSex',
  },
  edgeConfig: {
    type: 'family_edge',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  censusPrompt: 'Build your family',
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
});

const protocolWith = (stages: unknown[]) => ({
  schemaVersion: 8,
  codebook: {
    node: {
      family_member: {
        name: 'Family member',
        color: 'node-color-seq-1',
        variables: {
          fmName: { name: 'fm_name', type: 'text', component: 'Text' },
          isEgo: { name: 'is_ego', type: 'boolean' },
          relationshipToEgo: { name: 'fm_relationship_to_ego', type: 'text' },
          biologicalSex: {
            name: 'biologicalSex',
            type: 'categorical',
            options: BIOLOGICAL_SEX_OPTIONS,
          },
          hasConditionX: { name: 'hasConditionX', type: 'boolean' },
        },
      },
    },
    edge: {
      family_edge: {
        name: 'Family edge',
        color: 'edge-color-seq-1',
        variables: {
          relationshipType: {
            name: 'relationshipType',
            type: 'categorical',
            options: RELATIONSHIP_TYPE_OPTIONS,
          },
          isActive: { name: 'isActive', type: 'boolean' },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            type: 'boolean',
          },
          gameteRole: {
            name: 'gameteRole',
            type: 'categorical',
            options: GAMETE_ROLE_OPTIONS,
          },
        },
      },
    },
  },
  stages,
});

const nodeSubject = { entity: 'node', type: 'family_member' };
const booleanOptions = [
  { label: 'is_ego', value: 'isEgo' },
  { label: 'hasConditionX', value: 'hasConditionX' },
];

describe('interface-owned variable derivation', () => {
  const state = stateWith(protocolWith([pedigreeStage('fp1')]));

  it('maps each structural slot to the interface that owns it', () => {
    const map = getExclusiveVariableSlotMap(state);
    expect(map[roleMapKey(nodeSubject, 'isEgo')]?.slot).toBe(EGO_SLOT);
    expect(
      map[roleMapKey({ entity: 'edge', type: 'family_edge' }, 'gameteRole')]
        ?.slot,
    ).toBe('familyPedigree.edgeConfig.gameteRoleVariable');
    // The label variable is a normal participant answer, and biological sex is
    // only OPTION-owned; neither is claimed.
    expect(map[roleMapKey(nodeSubject, 'fmName')]).toBeUndefined();
    expect(map[roleMapKey(nodeSubject, 'biologicalSex')]).toBeUndefined();
  });

  it('maps the option-owned variables to their canonical sets', () => {
    const map = getInterfaceOwnedOptionMap(state);
    expect(map[roleMapKey(nodeSubject, 'biologicalSex')]).toBe('biologicalSex');
    expect(
      map[
        roleMapKey({ entity: 'edge', type: 'family_edge' }, 'relationshipType')
      ],
    ).toBe('relationshipType');
    expect(map[roleMapKey(nodeSubject, 'isEgo')]).toBeUndefined();
  });

  it('drops an owned variable from a picker that fills no slot', () => {
    expect(
      excludeInterfaceOwned(state, nodeSubject, booleanOptions).map(
        (option) => option.value,
      ),
    ).toEqual(['hasConditionX']);
  });

  it('keeps an owned variable offered to the picker that fills its own slot', () => {
    expect(
      excludeInterfaceOwned(
        state,
        nodeSubject,
        booleanOptions,
        undefined,
        EGO_SLOT,
      ).map((option) => option.value),
    ).toEqual(['isEgo', 'hasConditionX']);
  });

  it('keeps the current value offered so an imported pick never renders blank', () => {
    expect(
      excludeInterfaceOwned(state, nodeSubject, booleanOptions, 'isEgo').map(
        (option) => option.value,
      ),
    ).toEqual(['isEgo', 'hasConditionX']);
  });

  it('leaves a second pedigree free to reuse the same slot', () => {
    // Two FamilyPedigree stages over one node type legitimately share their
    // structural variables; the rule is slot-aware for exactly this reason.
    const twoPedigrees = stateWith(
      protocolWith([pedigreeStage('fp1'), pedigreeStage('fp2')]),
    );
    expect(
      excludeInterfaceOwned(
        twoPedigrees,
        nodeSubject,
        booleanOptions,
        undefined,
        EGO_SLOT,
      ).map((option) => option.value),
    ).toEqual(['isEgo', 'hasConditionX']);
    expect(
      interfaceOwnedPickIssue(
        getExclusiveVariableSlotMap(twoPedigrees),
        nodeSubject,
        'isEgo',
        EGO_SLOT,
      ),
    ).toBeUndefined();
  });

  it('explains the refusal in researcher language', () => {
    const issue = interfaceOwnedPickIssue(
      getExclusiveVariableSlotMap(state),
      nodeSubject,
      'isEgo',
    );
    expect(issue).toBe(
      'This attribute is set by the Family Pedigree interface, which marks the participant, so it cannot be used here. Choose a different attribute.',
    );
  });

  it('does not scope a claim across subjects', () => {
    expect(
      interfaceOwnedPickIssue(
        getExclusiveVariableSlotMap(state),
        { entity: 'node', type: 'someone_else' },
        'isEgo',
      ),
    ).toBeUndefined();
  });
});
