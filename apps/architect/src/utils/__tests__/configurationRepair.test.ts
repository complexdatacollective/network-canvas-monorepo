import { describe, expect, it } from 'vitest';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';
import { assessConfigurationRepair } from '~/utils/configurationRepair';

type Stage = Record<string, unknown>;

const familyPedigree = (overrides: Stage = {}): Stage => ({
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree',
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
  ...overrides,
});

const protocolWith = (stages: Stage[]) => ({
  name: 'Pedigree protocol',
  schemaVersion: 8 as const,
  codebook: {
    node: {
      family_member: {
        name: 'Family member',
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
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

describe('assessConfigurationRepair', () => {
  it('reports clean when nothing it recognises is wrong', async () => {
    const assessment = await assessConfigurationRepair(
      protocolWith([familyPedigree()]),
    );
    expect(assessment.status).toBe('clean');
  });

  it('offers a repair, and the repaired protocol is proven to validate', async () => {
    const assessment = await assessConfigurationRepair(
      protocolWith([
        familyPedigree({
          nominationPrompts: [
            { id: 'np1', text: 'Who has this?', variable: 'hasConditionX' },
            { id: 'np2', text: 'Who is you?', variable: 'isEgo' },
          ],
        }),
      ]),
    );
    expect(assessment.status).toBe('repairable');
    if (assessment.status !== 'repairable') return;
    expect(assessment.problems).toHaveLength(1);
    expect(assessment.problems[0]?.repair).toBeDefined();
    const stage = assessment.protocol.stages[0] as {
      nominationPrompts?: unknown[];
    };
    expect(stage.nominationPrompts).toHaveLength(1);
  });

  it('reports clean when a repair would not make the protocol open anyway', async () => {
    // The duplicate nomination prompt is repairable, but the stage's label is
    // empty — a problem this module does not fix. Reporting `clean` sends the
    // caller back to the underlying validation error rather than offering a
    // fix that would leave the researcher exactly where they started.
    const assessment = await assessConfigurationRepair(
      protocolWith([
        familyPedigree({
          label: '',
          nominationPrompts: [
            { id: 'np1', text: 'Who has this?', variable: 'hasConditionX' },
            { id: 'np2', text: 'Who is you?', variable: 'isEgo' },
          ],
        }),
      ]),
    );
    expect(assessment.status).toBe('clean');
  });

  it('reports unrepairable without a repair when nothing can be dropped', async () => {
    const assessment = await assessConfigurationRepair(
      protocolWith([
        familyPedigree(),
        familyPedigree({
          id: 'fp2',
          label: 'Second pedigree',
          nodeConfig: {
            type: 'family_member',
            nodeLabelVariable: 'isEgo',
            egoVariable: 'isEgo',
            relationshipVariable: 'relationshipToEgo',
            biologicalSexVariable: 'biologicalSex',
          },
        }),
      ]),
    );
    expect(assessment.status).toBe('unrepairable');
    if (assessment.status !== 'unrepairable') return;
    expect(
      assessment.problems.every((problem) => problem.repair === undefined),
    ).toBe(true);
  });
});
