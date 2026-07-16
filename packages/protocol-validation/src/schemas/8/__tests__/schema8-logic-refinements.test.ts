import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Tests for the schema-conformance logic-validation refinements:
 * - Form fields must reference a variable with a renderable component
 *   (reject layout/location variables)
 * - quickAdd must reference an existing text variable on the subject node type
 * - CategoricalBin requires otherOptionLabel when otherVariable is set
 * - sociogram highlight.variable must reference a boolean variable
 * - sociogram layout.layoutVariable must reference a layout-typed variable
 * - RelativeDatePicker before/after must be non-negative (independent offsets);
 *   anchor must be a valid ISO date
 * - ordinal options must be non-empty
 * - external-data panel filter rules must target node attributes (no edge rules)
 */
describe('Protocol Schema V8 - logic-validation refinements', () => {
  describe('form field renderable component', () => {
    it('rejects a form field referencing a layout variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                position: { name: 'Position', type: 'layout' },
              },
            },
          },
        },
        stages: [
          {
            id: 'alterForm1',
            type: 'AlterForm',
            label: 'Alter Form',
            subject: { entity: 'node', type: 'person' },
            form: {
              fields: [{ variable: 'position', prompt: 'Place node' }],
            },
            introductionPanel: { title: 'Intro', text: 'text' },
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes('cannot be rendered'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts a form field referencing a renderable variable', () => {
      const result = ProtocolSchemaV8.safeParse(createBaseProtocol());
      expect(result.success).toBe(true);
    });
  });

  describe('quickAdd cross-reference', () => {
    it('rejects quickAdd referencing a non-existent variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'quickAdd1',
            type: 'NameGeneratorQuickAdd',
            label: 'Quick Add',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'doesNotExist',
            prompts: [{ id: 'p1', text: 'Add someone' }],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes('quickAdd'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('rejects quickAdd referencing a non-text variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'quickAdd1',
            type: 'NameGeneratorQuickAdd',
            label: 'Quick Add',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'age',
            prompts: [{ id: 'p1', text: 'Add someone' }],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes('quickAdd'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts quickAdd referencing an existing text variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'quickAdd1',
            type: 'NameGeneratorQuickAdd',
            label: 'Quick Add',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'name',
            prompts: [{ id: 'p1', text: 'Add someone' }],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });

  describe('CategoricalBin otherOptionLabel', () => {
    it('rejects a prompt with otherVariable but no otherOptionLabel', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'catBin1',
            type: 'CategoricalBin',
            label: 'Categorise',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Categorise',
                variable: 'category',
                otherVariable: 'name',
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes('otherOptionLabel'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts a prompt with otherVariable and otherOptionLabel', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'catBin1',
            type: 'CategoricalBin',
            label: 'Categorise',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Categorise',
                variable: 'category',
                otherVariable: 'name',
                otherOptionLabel: 'Other',
                otherVariablePrompt: 'Please specify',
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });
  describe('sociogram highlight.variable type', () => {
    it('rejects highlight.variable referencing a non-boolean variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Highlight',
                layout: { layoutVariable: 'layoutPos' },
                highlight: { allowHighlighting: true, variable: 'age' },
              },
            ],
          },
        ],
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                layoutPos: { name: 'LayoutPos', type: 'layout' },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes('highlight'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts highlight.variable referencing a boolean variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                layoutPos: { name: 'LayoutPos', type: 'layout' },
                flagged: {
                  name: 'Flagged',
                  type: 'boolean',
                  component: 'Boolean',
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Highlight',
                layout: { layoutVariable: 'layoutPos' },
                highlight: { allowHighlighting: true, variable: 'flagged' },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });

  describe('sociogram layout.layoutVariable type', () => {
    it('rejects layoutVariable referencing a non-layout variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'age' },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes('layoutVariable'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts layoutVariable referencing a layout variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                layoutPos: { name: 'LayoutPos', type: 'layout' },
              },
            },
          },
        },
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });

  describe('RelativeDatePicker parameters', () => {
    const buildProtocolWithParams = (parameters: unknown) => {
      const base = createBaseProtocol();
      return {
        ...base,
        codebook: {
          ...base.codebook,
          ego: {
            variables: {
              ...base.codebook.ego.variables,
              when: {
                name: 'When',
                type: 'datetime',
                component: 'RelativeDatePicker',
                parameters,
              },
            },
          },
        },
      };
    };

    it('rejects a negative before value', () => {
      const result = ProtocolSchemaV8.safeParse(
        buildProtocolWithParams({ anchor: '2020-01-01', before: -1, after: 5 }),
      );
      expect(result.success).toBe(false);
    });

    it('accepts before greater than after (independent opposite-direction offsets)', () => {
      // earliest = anchor - before, latest = anchor + after, so before > after
      // is a valid range (e.g. the default before=180/after=0).
      const result = ProtocolSchemaV8.safeParse(
        buildProtocolWithParams({ anchor: '2020-01-01', before: 10, after: 5 }),
      );
      expect(result.success).toBe(true);
    });

    it('rejects an invalid anchor date', () => {
      const result = ProtocolSchemaV8.safeParse(
        buildProtocolWithParams({ anchor: 'not-a-date', before: 1, after: 5 }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an impossible calendar anchor date (e.g. 2020-02-31)', () => {
      // Date.parse normalizes 2020-02-31 to a real March date, so the anchor
      // check must validate calendar bounds rather than rely on Date.parse.
      const result = ProtocolSchemaV8.safeParse(
        buildProtocolWithParams({ anchor: '2020-02-31', before: 1, after: 5 }),
      );
      expect(result.success).toBe(false);
    });

    it('accepts a valid leap-day anchor (2020-02-29)', () => {
      const result = ProtocolSchemaV8.safeParse(
        buildProtocolWithParams({ anchor: '2020-02-29', before: 1, after: 5 }),
      );
      expect(result.success).toBe(true);
    });

    it('accepts valid before/after/anchor', () => {
      const result = ProtocolSchemaV8.safeParse(
        buildProtocolWithParams({ anchor: '2020-01-01', before: 1, after: 5 }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('ordinal options non-empty', () => {
    it('rejects an ordinal variable with empty options', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                rank: {
                  name: 'Rank',
                  type: 'ordinal',
                  component: 'LikertScale',
                  options: [],
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
    });
  });

  describe('external-data panel filter edge rules', () => {
    it('rejects an external-data panel filter with an edge rule', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'nameGen1',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'name', prompt: 'Name' }] },
            prompts: [{ id: 'p1', text: 'Who?' }],
            panels: [
              {
                id: 'panel1',
                title: 'From CSV',
                dataSource: 'someAssetId',
                filter: {
                  rules: [
                    {
                      type: 'edge',
                      id: 'r1',
                      options: { type: 'knows', operator: 'EXISTS' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes('edge'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts an external-data panel filter with a node rule', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'nameGen1',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'name', prompt: 'Name' }] },
            prompts: [{ id: 'p1', text: 'Who?' }],
            panels: [
              {
                id: 'panel1',
                title: 'From CSV',
                dataSource: 'someAssetId',
                filter: {
                  rules: [
                    {
                      type: 'node',
                      id: 'r1',
                      options: { type: 'person', operator: 'EXISTS' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });
});
