import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { familyPedigreeWordingIn } from '../../../__tests__/suppliedWording.ts';
import {
  createBaseProtocol,
  localized,
  localizedOptions,
} from '../../../utils/test-utils.ts';
import {
  FormFieldArraySchema,
  FormSchema,
  TitlelessFormSchema,
} from '../common/index.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { familyPedigreeStage } from '../stages/family-pedigree.ts';
import { pedigreeNameField } from './family-pedigree-text.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from './pedigreeGenderFixtures.ts';

// Every field gets an id of its own, so a test about repeated variables is not
// also about repeated ids.
let fieldCount = 0;
const field = (variable: string, prompt: string) => {
  fieldCount += 1;
  return {
    id: `field-${fieldCount}`,
    variable,
    prompt: localized(prompt),
  };
};

const pedigreeStage = (form?: ReturnType<typeof field>[]) => ({
  id: 'fp1',
  label: localized('Family Pedigree'),
  type: 'FamilyPedigree' as const,
  wording: familyPedigreeWordingIn(),
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
            isEgo: { name: 'IsEgo', type: 'boolean' },
            gender: {
              name: 'Gender',
              type: 'categorical',
              options: GENDER_IDENTITY_OPTIONS,
            },
            sab: {
              name: 'Sab',
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
              type: 'categorical',
              options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
            },
            carrier: { name: 'Carrier', type: 'boolean' },
            current: { name: 'Current', type: 'boolean' },
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
            form: { fields: [field('name', 'Name?'), field('name', 'Again?')] },
          },
        ],
      }),
    );
    expect(parseIssues(result)).toEqual([
      {
        path: 'stages.2.form.fields.1.variable',
        code: 'custom',
        message: 'Form fields contain duplicate attribute "name"',
      },
    ]);
  });
});

describe('form field id uniqueness', () => {
  const fieldWithId = (id: string, variable: string) => ({
    ...field(variable, `${variable}?`),
    id,
  });

  it('accepts a form whose fields each have a different id', () => {
    expect(
      TitlelessFormSchema.safeParse({
        fields: [fieldWithId('a', 'name'), fieldWithId('b', 'age')],
      }).success,
    ).toBe(true);
  });

  it.each([
    [
      'FormSchema',
      (fields: unknown[]) =>
        FormSchema.safeParse({ title: localized('Add'), fields }),
    ],
    [
      'TitlelessFormSchema',
      (fields: unknown[]) => TitlelessFormSchema.safeParse({ fields }),
    ],
    [
      'FormFieldArraySchema',
      (fields: unknown[]) => FormFieldArraySchema.safeParse(fields),
    ],
  ])('rejects the second field of a %s sharing an id', (_name, parse) => {
    const result = parse([
      fieldWithId('same', 'name'),
      fieldWithId('other', 'age'),
      fieldWithId('same', 'category'),
    ]);
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.map(({ message }) => message)).toContain(
      'Form fields contain duplicate id "same"',
    );
    // On the repeat, never the first occurrence, and on its own `id`.
    expect(issues.map(({ path }) => path.slice(-2))).toContainEqual([2, 'id']);
    expect(issues.map(({ path }) => path.slice(-2))).not.toContainEqual([
      0,
      'id',
    ]);
  });

  it('allows two forms to use the same id', () => {
    const a = TitlelessFormSchema.safeParse({
      fields: [fieldWithId('x', 'name')],
    });
    const b = TitlelessFormSchema.safeParse({
      fields: [fieldWithId('x', 'age')],
    });
    expect(a.success && b.success).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not text', 7],
  ])('rejects a field whose id is %s', (_name, id) => {
    const { id: _id, ...rest } = fieldWithId('a', 'name');
    const result = TitlelessFormSchema.safeParse({
      fields: [id === undefined ? rest : { ...rest, id }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path }) => path)).toContainEqual([
      'fields',
      0,
      'id',
    ]);
  });
});
