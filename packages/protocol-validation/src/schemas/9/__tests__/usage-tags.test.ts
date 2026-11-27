import { describe, expect, it } from 'vitest';

import { familyPedigreeWordingIn } from '../../../__tests__/suppliedWording.ts';
import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';

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
          label: localized('Bin'),
          subject: { entity: 'node', types: ['person'] },
          prompts: [
            {
              id: 'p1',
              text: localized('Sort'),
              variable: 'category',
              otherVariable: 'name',
              otherVariablePrompt: localized('What?'),
              otherOptionLabel: localized('Other'),
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
          label: localized('Composer'),
          subject: { entity: 'node', types: ['person'] },
          quickAdd: 'name',
          layout: 'layoutPosition',
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

  it('tags the FamilyPedigree name as validated and its structural slots as unvalidated', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'family',
          type: 'FamilyPedigree',
          wording: familyPedigreeWordingIn(),
          label: localized('Family'),
          subject: { entity: 'node', types: ['person'] },
          prompt: localized('Build your family'),
          nodeConfiguration: {
            nameAttribute: 'name',
            genderIdentity: { attribute: 'gender', terms: [] },
            sexAssignedAtBirthAttribute: 'sab',
            egoAttribute: 'isEgo',
          },
          edgeConfiguration: {
            type: 'family',
            kindAttribute: 'kind',
            gestationalCarrierAttribute: 'carrier',
            currentPartnerAttribute: 'current',
          },
        },
      ],
    };

    const hits = hitsFor(protocol);
    const name = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'nameAttribute',
    );
    const ego = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'egoAttribute',
    );
    const kind = hits.find(
      (hit) => hit.path[hit.path.length - 1] === 'kindAttribute',
    );

    expect(name?.usage).toBe('validatedAttribute');
    expect(ego?.usage).toBe('unvalidatedAttribute');
    expect(kind?.usage).toBe('unvalidatedAttribute');
  });

  // A Sociogram highlight task is how the participant sets the attribute, so
  // each of its entries writes the variable it names.
  it('tags a Sociogram highlight entry variable as written', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'sg1',
          type: 'Sociogram',
          label: localized('Map'),
          subject: { entity: 'node', types: ['person'] },
          background: { concentricCircles: 4 },
          layout: 'layoutPosition',
          prompts: [
            {
              id: 'p1',
              task: 'highlight',
              text: localized('Tap them'),
              highlight: [{ id: 'h1', type: 'person', variable: 'strength' }],
            },
          ],
        },
      ],
    };
    const highlightHits = hitsFor(protocol).filter(
      (hit) =>
        hit.path.includes('highlight') &&
        hit.path[hit.path.length - 1] === 'variable',
    );
    expect(highlightHits).toHaveLength(1);
    expect(highlightHits[0]?.usage).toBe('unvalidatedAttribute');
  });

  it('leaves Narrative preset groupVariable and highlight references untagged (grouping/display slots never restrict a variable elsewhere)', () => {
    const protocol = {
      ...createBaseProtocol(),
      stages: [
        {
          id: 'nar1',
          type: 'Narrative',
          label: localized('Narrative'),
          subject: { entity: 'node', types: ['person'] },
          presets: [
            {
              id: 'preset-1',
              label: localized('Preset'),
              layout: 'layoutPosition',
              groupVariable: 'category',
              highlight: [
                {
                  id: 'highlight-1',
                  label: localized('Close'),
                  attributes: [
                    { id: 'attribute-1', type: 'person', variable: 'close' },
                  ],
                },
              ],
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
