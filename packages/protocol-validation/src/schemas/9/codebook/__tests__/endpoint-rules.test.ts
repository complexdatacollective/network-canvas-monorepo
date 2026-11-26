import { describe, expect, it } from 'vitest';

import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import { testTypeId } from '../../../../__tests__/testIds.ts';
import { CodebookSchema } from '../codebook.ts';

const PERSON = testTypeId('person');
const ORG = testTypeId('organisation');
const ADVICE = testTypeId('advice');
const UNKNOWN = testTypeId('unknown');

const nodeType = (name: string) => ({
  name,
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
});

const codebookWithEdge = (edge: Record<string, unknown>) => ({
  node: { [PERSON]: nodeType('Person'), [ORG]: nodeType('Organisation') },
  edge: { [ADVICE]: { name: 'Advice', ...edge } },
});

const rule = (sourceType: string, targetType: string) => ({
  sourceType,
  targetType,
});

describe('edge type endpoint rules', () => {
  it('accepts a directed type with rules', () => {
    expect(
      CodebookSchema.safeParse(
        codebookWithEdge({
          directed: true,
          endpointRules: [rule(PERSON, ORG), rule(PERSON, PERSON)],
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects an empty endpointRules', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(codebookWithEdge({ endpointRules: [] })),
      ),
    ).toEqual([{ path: `edge.${ADVICE}.endpointRules`, code: 'too_small' }]);
  });

  it('rejects a rule naming an unknown node type', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWithEdge({ endpointRules: [rule(PERSON, UNKNOWN)] }),
        ),
      ),
    ).toEqual([
      {
        path: `edge.${ADVICE}.endpointRules.0.targetType`,
        code: 'custom',
        message: `Edge type "Advice" has a connection rule naming node type "${UNKNOWN}", which does not exist.`,
      },
    ]);
  });

  it('rejects {A,B} after {B,A} on an undirected type', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWithEdge({
            endpointRules: [rule(ORG, PERSON), rule(PERSON, ORG)],
          }),
        ),
      ),
    ).toEqual([
      {
        path: `edge.${ADVICE}.endpointRules.1`,
        code: 'custom',
        message:
          'Edge type "Advice" allows connections between "Person" and "Organisation" more than once.',
      },
    ]);
  });

  it('accepts {A,B} and {B,A} on a directed type', () => {
    expect(
      CodebookSchema.safeParse(
        codebookWithEdge({
          directed: true,
          endpointRules: [rule(ORG, PERSON), rule(PERSON, ORG)],
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects the same ordered rule twice on a directed type', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(
          codebookWithEdge({
            directed: true,
            endpointRules: [rule(PERSON, ORG), rule(PERSON, ORG)],
          }),
        ),
      ),
    ).toEqual([
      {
        path: `edge.${ADVICE}.endpointRules.1`,
        code: 'custom',
        message:
          'Edge type "Advice" allows connections from "Person" to "Organisation" more than once.',
      },
    ]);
  });

  it('rejects directed: false', () => {
    expect(
      parseIssues(
        CodebookSchema.safeParse(codebookWithEdge({ directed: false })),
      ),
    ).toEqual([{ path: `edge.${ADVICE}.directed`, code: 'invalid_value' }]);
  });
});
