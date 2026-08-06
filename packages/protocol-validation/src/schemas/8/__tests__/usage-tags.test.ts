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
    expect(otherVariable?.requireType).toEqual(['text']);
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

  it('tags NetworkComposer quickAdd as validatedAttribute and convexHullVariable as unvalidatedAttribute', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'nc1',
          type: 'NetworkComposer',
          label: 'Composer',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'layoutPosition',
          convexHullVariable: 'category',
        },
      ],
    };
    const hits = hitsFor(protocol);
    const quickAddHit = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'quickAdd',
    );
    const hullHit = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'convexHullVariable',
    );
    expect(quickAddHit?.usage).toBe('validatedAttribute');
    expect(hullHit?.usage).toBe('unvalidatedAttribute');
  });

  it('tags the FamilyPedigree node label as validated and its structural slots as unvalidated', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'family',
          type: 'FamilyPedigree',
          label: 'Family',
          nodeConfig: {
            type: 'person',
            nodeLabelVariable: 'name',
            egoVariable: 'isEgo',
            relationshipVariable: 'relationship',
            biologicalSexVariable: 'biologicalSex',
          },
          edgeConfig: {
            type: 'family',
            relationshipTypeVariable: 'relationshipType',
            isActiveVariable: 'isActive',
            isGestationalCarrierVariable: 'isGestationalCarrier',
            gameteRoleVariable: 'gameteRole',
          },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'off',
          },
          censusPrompt: 'Build your family',
        },
      ],
    };

    const hits = hitsFor(protocol);
    const nodeLabel = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'nodeLabelVariable',
    );
    const relationship = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'relationshipVariable',
    );

    expect(nodeLabel?.usage).toBe('validatedAttribute');
    expect(relationship?.usage).toBe('unvalidatedAttribute');
  });

  it('leaves Narrative preset groupVariable and highlight references untagged (grouping/display slots never restrict a variable elsewhere)', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'nar1',
          type: 'Narrative',
          label: 'Narrative',
          subject: { entity: 'node', type: 'person' },
          presets: [
            {
              id: 'preset-1',
              label: 'Preset',
              layoutVariable: 'layoutPosition',
              groupVariable: 'category',
              highlight: ['strength'],
            },
          ],
        },
      ],
    };
    const hits = hitsFor(protocol);
    const groupHit = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'groupVariable',
    );
    const highlightHits = hits.filter((hit) => hit.path.includes('highlight'));
    expect(groupHit?.usage).toBeUndefined();
    expect(highlightHits.length).toBeGreaterThan(0);
    for (const hit of highlightHits) {
      expect(hit.usage).toBeUndefined();
    }
  });
});
