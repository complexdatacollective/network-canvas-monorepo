import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '../apply.ts';
import {
  assembledProtocol,
  entityTypeReferences,
  sweepReferences,
} from '../section-references.ts';
import { sectionId } from '../taxonomy.ts';

const PERSON = crypto.randomUUID();
const ORG = crypto.randomUUID();
const PLACE = crypto.randomUUID();
const KNOWS = crypto.randomUUID();

const nodeType = (name: string): SectionDoc => ({
  name,
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
});

const KNOWS_SECTION = sectionId({ kind: 'codebookEdge', typeId: KNOWS });

const documentsWithRules = (
  endpointRules: { sourceType: string; targetType: string }[],
): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'settings' })]: {},
  [sectionId({ kind: 'stageOrder' })]: { stages: [] },
  [sectionId({ kind: 'codebookNode', typeId: PERSON })]: nodeType('Person'),
  [sectionId({ kind: 'codebookNode', typeId: PLACE })]: nodeType('Place'),
  [KNOWS_SECTION]: {
    name: 'Knows',
    color: 'edge-color-seq-1',
    endpointRules,
  },
});

// Deleting the Organisation node type, as a host does: its section goes, then
// the sweep removes what still names it.
const deleteOrg = (documents: Record<string, SectionDoc>) =>
  sweepReferences(documents, (current) =>
    entityTypeReferences(assembledProtocol(current), 'node', ORG),
  );

describe('reference sweep', () => {
  it.each([
    {
      name: 'the only rule',
      rules: [{ sourceType: ORG, targetType: PERSON }],
    },
    {
      name: 'one of several rules',
      rules: [
        { sourceType: PERSON, targetType: PLACE },
        { sourceType: ORG, targetType: PERSON },
      ],
    },
  ])(
    'leaves an endpoint rule naming the deleted node type when it is $name',
    ({ rules }) => {
      const documents = documentsWithRules(rules);
      const ruleIndex = rules.findIndex(({ sourceType }) => sourceType === ORG);

      const { rewritten, remaining } = deleteOrg(documents);

      expect(rewritten.size).toBe(0);
      expect(remaining).toEqual([
        {
          sectionId: KNOWS_SECTION,
          path: ['endpointRules', ruleIndex, 'sourceType'],
        },
      ]);
      expect(documents[KNOWS_SECTION]?.endpointRules).toEqual(rules);
    },
  );
});
