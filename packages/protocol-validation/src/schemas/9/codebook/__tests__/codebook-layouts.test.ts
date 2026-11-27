import { describe, expect, it } from 'vitest';

import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import { testTypeId, testVariableId } from '../../../../__tests__/testIds.ts';
import { CodebookSchema } from '../codebook.ts';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
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

const codebookWith = ({
  layouts,
  placeVariables,
}: {
  layouts: Record<string, { name: string }>;
  placeVariables?: Record<string, { name: string; type: string }>;
}) => ({
  node: {
    [PERSON]: nodeType('Person', { [AGE]: { name: 'age', type: 'number' } }),
    [PLACE]: nodeType('Place', placeVariables),
  },
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

  it('rejects a layout whose derived column equals another layout’s', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWith({
            layouts: {
              [SOCIOGRAM]: { name: 'a b' },
              [MAP]: { name: 'a_b' },
            },
          }),
        ),
      ).map(({ message }) => message),
    ).toContain(
      'Layout "a b" would be exported to a column called "a b_X", which the layout "a_b" is also exported to',
    );
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
});
