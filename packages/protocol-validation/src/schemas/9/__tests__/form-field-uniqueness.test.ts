import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { familyPedigreeWordingIn } from '../../../__tests__/suppliedWording.ts';
import { testId } from '../../../__tests__/testIds.ts';
import { DUPLICATE_OBJECT_ID } from '../../../utils/protocolObjectIds.ts';
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
    id: testId(`field-${fieldCount}`),
    variable,
    prompt: localized(prompt),
  };
};

const pedigreeStage = (form?: ReturnType<typeof field>[]) => ({
  id: testId('fp1'),
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
            id: testId('af1'),
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
            id: testId('af1'),
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
    id: testId(id),
  });

  // Any issue other than a repeated id shows up as its message, so that the
  // repeat is the only thing wrong with the fixture.
  const duplicateIdPaths = (protocol: unknown) =>
    (
      ProtocolSchemaV9.safeParse(withFinishStage(protocol)).error?.issues ?? []
    ).map((issue) =>
      issue.code === 'custom' && issue.params?.rule === DUPLICATE_OBJECT_ID
        ? issue.path.join('.')
        : issue.message,
    );

  const alterForm = (id: string, fields: unknown[]) => ({
    id: testId(id),
    type: 'AlterForm',
    label: localized('Alter form'),
    subject: { entity: 'node', type: 'person' },
    form: { fields },
  });

  const composerField = (id: string, variable: string, component: string) => ({
    id: testId(id),
    variable,
    label: localized(variable),
    component,
  });

  it('accepts a form whose fields each have a different id', () => {
    expect(
      TitlelessFormSchema.safeParse({
        fields: [fieldWithId('a', 'name'), fieldWithId('b', 'age')],
      }).success,
    ).toBe(true);
  });

  it('refuses a field id repeated in two forms of one stage', () => {
    const protocol = createBaseProtocol();
    const paths = duplicateIdPaths({
      ...protocol,
      stages: [
        ...protocol.stages,
        {
          id: testId('nc1'),
          label: localized('Build the network'),
          type: 'NetworkComposer',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          background: { concentricCircles: 4 },
          nodeForm: { fields: [composerField('same', 'age', 'Number')] },
          edges: [
            {
              id: testId('nc1-knows'),
              subject: { entity: 'edge', type: 'knows' },
              label: localized('Knows'),
              form: {
                fields: [composerField('same', 'duration', 'Number')],
              },
            },
          ],
        },
      ],
    });
    expect(paths).toEqual([
      'stages.2.nodeForm.fields.0.id',
      'stages.2.edges.0.form.fields.0.id',
    ]);
  });

  it('refuses a field id repeated in the forms of two stages', () => {
    const protocol = createBaseProtocol();
    const paths = duplicateIdPaths({
      ...protocol,
      stages: [
        ...protocol.stages,
        alterForm('af1', [fieldWithId('same', 'name')]),
        alterForm('af2', [fieldWithId('same', 'age')]),
      ],
    });
    expect(paths).toEqual([
      'stages.2.form.fields.0.id',
      'stages.3.form.fields.0.id',
    ]);
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
