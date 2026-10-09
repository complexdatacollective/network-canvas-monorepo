import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  createBaseProtocol,
  localized,
  localizedOptions,
} from '../../../utils/test-utils.ts';
import { FormSchema, TitlelessFormSchema } from '../common/index.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { familyPedigreeWordingIn } from '../stage-wording/family-pedigree.ts';
import { familyPedigreeStage } from '../stages/family-pedigree.ts';
import { pedigreeNameField } from './family-pedigree-text.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from './pedigreeGenderFixtures.ts';

const field = (variable: string, prompt: string) => ({
  variable,
  prompt: localized(prompt),
});

const pedigreeStage = (form?: ReturnType<typeof field>[]) => ({
  id: 'fp1',
  label: localized('Family Pedigree'),
  type: 'FamilyPedigree' as const,
  wording: familyPedigreeWordingIn('en'),
  subject: { entity: 'node' as const, type: 'person' },
  prompt: localized('Build your family'),
  nodeConfiguration: {
    nameAttribute: 'name',
    nameField: pedigreeNameField(),
    genderIdentity: { attribute: 'gender', terms: GENDER_IDENTITY_TERMS },
    sexAssignedAtBirthAttribute: 'sab',
    egoAttribute: 'isEgo',
  },
  edgeConfiguration: {
    type: 'knows',
    kindAttribute: 'kind',
    gestationalCarrierAttribute: 'carrier',
    currentPartnerAttribute: 'current',
  },
  ...(form ? { form: { fields: form } } : {}),
});

const pedigreeProtocol = (form?: ReturnType<typeof field>[]) => {
  const protocol = createBaseProtocol();
  return {
    ...protocol,
    codebook: {
      ...protocol.codebook,
      node: {
        ...protocol.codebook.node,
        person: {
          ...protocol.codebook.node.person,
          variables: {
            ...protocol.codebook.node.person.variables,
            isEgo: { name: 'IsEgo', label: 'IsEgo', type: 'boolean' },
            gender: {
              name: 'Gender',
              label: 'Gender',
              type: 'categorical',
              options: GENDER_IDENTITY_OPTIONS,
            },
            sab: {
              name: 'Sab',
              label: 'Sab',
              type: 'categorical',
              options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
            },
          },
        },
      },
      edge: {
        ...protocol.codebook.edge,
        knows: {
          ...protocol.codebook.edge.knows,
          variables: {
            ...protocol.codebook.edge.knows.variables,
            kind: {
              name: 'Kind',
              label: 'Kind',
              type: 'categorical',
              options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
            },
            carrier: { name: 'Carrier', label: 'Carrier', type: 'boolean' },
            current: { name: 'Current', label: 'Current', type: 'boolean' },
          },
        },
      },
    },
    stages: [pedigreeStage(form)],
  };
};

describe('form field variable uniqueness', () => {
  it('accepts a form whose fields each name a different variable', () => {
    expect(
      FormSchema.safeParse({
        title: localized('Add a person'),
        fields: [field('name', 'Name?'), field('age', 'Age?')],
      }).success,
    ).toBe(true);
  });

  it('rejects a FormSchema form that names one variable twice', () => {
    const result = FormSchema.safeParse({
      title: localized('Add a person'),
      fields: [
        field('name', 'Name?'),
        field('age', 'Age?'),
        field('name', 'Name again?'),
      ],
    });
    expect(result.success).toBe(false);
    // The path must land on the offending field's own `variable` so Architect's
    // Issues anchor resolves to the picker that has to change.
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'fields',
      2,
      'variable',
    ]);
  });

  it('rejects a TitlelessFormSchema form that names one variable twice', () => {
    const result = TitlelessFormSchema.safeParse({
      fields: [field('name', 'Name?'), field('name', 'Name again?')],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'fields',
      1,
      'variable',
    ]);
  });

  it('rejects a FamilyPedigree form that names one variable twice', () => {
    const result = familyPedigreeStage.safeParse(
      pedigreeStage([field('age', 'Age?'), field('age', 'Age again?')]),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'form',
      'fields',
      1,
      'variable',
    ]);
  });

  it('accepts a FamilyPedigree form with distinct variables', () => {
    expect(
      familyPedigreeStage.safeParse(
        pedigreeStage([field('age', 'Age?'), field('category', 'Category?')]),
      ).success,
    ).toBe(true);
  });

  it('rejects the duplicate through whole-protocol validation', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(
        pedigreeProtocol([field('age', 'Age?'), field('age', 'Age again?')]),
      ),
    );
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) =>
          issue.message === 'Form fields contain duplicate attribute "age"',
      ),
    ).toBe(true);
  });

  it('accepts an AlterForm whose fields are distinct', () => {
    const protocol = createBaseProtocol();
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage({
        ...protocol,
        stages: [
          ...protocol.stages,
          {
            id: 'af1',
            type: 'AlterForm',
            label: localized('Alter form'),
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: localized('T'), text: localized('X') },
            form: { fields: [field('name', 'Name?'), field('age', 'Age?')] },
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('reports every repeated field after the first', () => {
    const fields = [
      field('age', 'First'),
      field('name', 'Name?'),
      field('age', 'Second'),
      field('age', 'Third'),
    ];
    const protocol = pedigreeProtocol(fields);

    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    const flaggedBySchema = (result.error?.issues ?? [])
      .filter(
        (issue) =>
          issue.message === 'Form fields contain duplicate attribute "age"',
      )
      .map((issue) => issue.path[issue.path.length - 2]);
    expect(flaggedBySchema).toEqual([2, 3]);
  });

  it('rejects an AlterForm that repeats a variable', () => {
    const protocol = createBaseProtocol();
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage({
        ...protocol,
        stages: [
          ...protocol.stages,
          {
            id: 'af1',
            type: 'AlterForm',
            label: localized('Alter form'),
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: localized('T'), text: localized('X') },
            form: { fields: [field('name', 'Name?'), field('name', 'Again?')] },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});
