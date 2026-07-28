import { describe, expect, it } from 'vitest';

import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';

const hitsFor = (protocol: unknown) =>
  collectEntityAttributeReferences(protocol);

describe('attribute-writer usage tags', () => {
  it('tags form fields as validatedAttribute', () => {
    const protocol = createBaseProtocol();
    const formHits = hitsFor(protocol).filter(
      (hit) =>
        hit.path.includes('fields') &&
        hit.path[hit.path.length - 1] === 'variable',
    );
    expect(formHits.length).toBeGreaterThan(0);
    for (const hit of formHits) {
      expect(hit.usage).toBe('validatedAttribute');
    }
  });

  it('tags a CategoricalBin prompt variable as unvalidatedAttribute and its otherVariable as validatedAttribute', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'cb1',
          type: 'CategoricalBin',
          label: 'Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'p1',
              text: 'Sort',
              variable: 'category',
              otherVariable: 'name',
              otherVariablePrompt: 'What?',
              otherOptionLabel: 'Other',
            },
          ],
        },
      ],
    };
    const hits = hitsFor(protocol);
    const promptVariable = hits.find(
      (hit) =>
        hit.path[hit.path.length - 1] === 'variable' &&
        hit.path.includes('prompts'),
    );
    const otherVariable = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'otherVariable',
    );
    expect(promptVariable?.usage).toBe('unvalidatedAttribute');
    expect(otherVariable?.usage).toBe('validatedAttribute');
    // The narrowed duplicate declarations must not produce double hits.
    expect(
      hits.filter(
        (hit) => hit.path.join('.') === promptVariable?.path.join('.'),
      ),
    ).toHaveLength(1);
  });

  it('leaves read-only references untagged', () => {
    const protocol = createBaseProtocol();
    const validationRefs = hitsFor(protocol).filter((hit) =>
      hit.path.includes('validation'),
    );
    for (const hit of validationRefs) {
      expect(hit.usage).toBeUndefined();
    }
  });
});
