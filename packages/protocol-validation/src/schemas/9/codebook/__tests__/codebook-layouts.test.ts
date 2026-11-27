import { describe, expect, it } from 'vitest';

import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import {
  testId,
  testTypeId,
  testVariableId,
} from '../../../../__tests__/testIds.ts';
import { CodebookSchema } from '../codebook.ts';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const ADVICE = testTypeId('advice');
const SOCIOGRAM = testVariableId('sociogram layout');
const MAP = testVariableId('map layout');
const AGE = testVariableId('age');

const nodeType = (
  name: string,
  variables: Record<string, { name: string; type: string }> = {},
) => ({
  name,
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables,
});

type VariablesFixture = Record<
  string,
  {
    name: string;
    type: string;
    options?: { id: string; label: { en: string }; value: string }[];
  }
>;

const codebookWith = ({
  layouts,
  placeVariables,
  edgeVariables,
  egoVariables,
}: {
  layouts: Record<string, { name: string }>;
  placeVariables?: VariablesFixture;
  edgeVariables?: VariablesFixture;
  egoVariables?: VariablesFixture;
}) => ({
  node: {
    [PERSON]: nodeType('Person', { [AGE]: { name: 'age', type: 'number' } }),
    [PLACE]: nodeType('Place', placeVariables),
  },
  ...(edgeVariables === undefined
    ? {}
    : {
        edge: {
          [ADVICE]: {
            name: 'Advice',
            color: 'edge-color-seq-1',
            endpointRules: [{ sourceType: PERSON, targetType: PERSON }],
            variables: edgeVariables,
          },
        },
      }),
  ...(egoVariables === undefined ? {} : { ego: { variables: egoVariables } }),
  layouts,
});

describe('codebook layouts', () => {
  it('accepts layouts with names of their own', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: {
              [SOCIOGRAM]: { name: 'sociogram' },
              [MAP]: { name: 'map' },
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('refuses a layout id that is not a UUID', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({ layouts: { sociogram: { name: 'sociogram' } } }),
        ),
      ),
    ).toEqual([
      {
        path: 'layouts.sociogram',
        code: 'invalid_key',
      },
    ]);
  });

  it('rejects two layouts with one name', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: {
              [SOCIOGRAM]: { name: 'sociogram' },
              [MAP]: { name: 'Sociogram' },
            },
          }),
        ),
      ),
    ).toEqual([
      {
        path: `layouts.${MAP}.name`,
        code: 'custom',
        message: 'Duplicate layout name "Sociogram"',
      },
    ]);
  });

  it('rejects a layout named like a node variable', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({ layouts: { [SOCIOGRAM]: { name: 'AGE' } } }),
        ),
      ),
    ).toEqual([
      {
        path: `layouts.${SOCIOGRAM}.name`,
        code: 'custom',
        message:
          'Layout "AGE" has the name of the attribute "age" of node type "Person"',
      },
    ]);
  });

  it('rejects a layout whose derived _x column equals a variable’s', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: { [SOCIOGRAM]: { name: 'sociogram' } },
            placeVariables: {
              [testVariableId('x')]: { name: 'sociogram_x', type: 'number' },
            },
          }),
        ),
      ),
    ).toEqual([
      {
        path: `layouts.${SOCIOGRAM}.name`,
        code: 'custom',
        message:
          'Layout "sociogram" would be exported to a column called "sociogram_x", which the attribute "sociogram_x" of node type "Place" is also exported to',
      },
    ]);
  });

  it('rejects a layout named like a variable of the second node type', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: { [SOCIOGRAM]: { name: 'seats' } },
            placeVariables: {
              [testVariableId('seats')]: { name: 'seats', type: 'number' },
            },
          }),
        ),
      ),
    ).toEqual([
      {
        path: `layouts.${SOCIOGRAM}.name`,
        code: 'custom',
        message:
          'Layout "seats" has the name of the attribute "seats" of node type "Place"',
      },
    ]);
  });

  it('accepts an edge or ego variable named like a layout or its columns', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: { [SOCIOGRAM]: { name: 'sociogram' } },
            edgeVariables: {
              [testVariableId('edge sociogram')]: {
                name: 'sociogram',
                type: 'text',
              },
              [testVariableId('edge sociogram_x')]: {
                name: 'sociogram_x',
                type: 'number',
              },
            },
            egoVariables: {
              [testVariableId('ego sociogram')]: {
                name: 'sociogram',
                type: 'text',
              },
              [testVariableId('ego sociogram_x')]: {
                name: 'sociogram_x',
                type: 'number',
              },
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('rejects a layout whose derived column equals a categorical option’s column', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: { [SOCIOGRAM]: { name: 'seat_ing' } },
            placeVariables: {
              [testVariableId('seat')]: {
                name: 'seat',
                type: 'categorical',
                options: [
                  {
                    id: testId('ing_x'),
                    label: { en: 'Ing x' },
                    value: 'ing_x',
                  },
                  { id: testId('row'), label: { en: 'Row' }, value: 'row' },
                ],
              },
            },
          }),
        ),
      ),
    ).toEqual([
      {
        path: `layouts.${SOCIOGRAM}.name`,
        code: 'custom',
        message:
          'Layout "seat_ing" would be exported to a column called "seat_ing_x", which the attribute "seat" of node type "Place" is also exported to',
      },
    ]);
  });

  it('rejects a layout whose derived column equals another layout’s, on the later layout', () => {
    const issues = parseIssues(
      CodebookSchema.safeParse(
        codebookWith({
          layouts: {
            [SOCIOGRAM]: { name: 'a b' },
            [MAP]: { name: 'a_b' },
          },
        }),
      ),
    );

    expect(issues.map(({ path }) => path)).not.toContain(
      `layouts.${SOCIOGRAM}.name`,
    );
    expect(issues).toContainEqual({
      path: `layouts.${MAP}.name`,
      code: 'custom',
      message:
        'Layout "a_b" would be exported to a column called "a_b_X", which the layout "a b" is also exported to',
    });
  });

  it('rejects a layout id reused as a variable id', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: { [AGE]: { name: 'sociogram' } },
          }),
        ),
      ),
    ).toEqual([
      {
        path: '',
        code: 'custom',
        message: `Attribute record key "${AGE}" is also the id of a layout`,
      },
    ]);
  });

  it.each([
    ['an edge', 'edgeVariables'],
    ['an ego', 'egoVariables'],
  ] as const)('rejects a layout id reused as %s variable id', (_, entity) => {
    const shared = testVariableId('shared');

    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: { [shared]: { name: 'sociogram' } },
            [entity]: { [shared]: { name: 'closeness', type: 'number' } },
          }),
        ),
      ),
    ).toEqual([
      {
        path: '',
        code: 'custom',
        message: `Attribute record key "${shared}" is also the id of a layout`,
      },
    ]);
  });
});
