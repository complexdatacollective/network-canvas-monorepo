import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '~/utils/test-utils';

import ProtocolSchemaV8 from '../schema';

/**
 * Tests for the schema-conformance logic-validation refinements:
 * - Form fields must reference a variable with a renderable component
 *   (reject layout/location variables)
 * - quickAdd must reference an existing text variable on the subject node type
 * - CategoricalBin requires otherOptionLabel when otherVariable is set
 * - FamilyPedigree nodeConfig.form variable ids must not collide with reserved
 *   wizard keys
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
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });

  describe('FamilyPedigree reserved form variable ids', () => {
    const buildPedigreeProtocol = (formVariable: string) => {
      const base = createBaseProtocol();
      return {
        ...base,
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                isEgo: { name: 'IsEgo', type: 'boolean' },
                relationship: { name: 'Relationship', type: 'text' },
                role: { name: 'Role', type: 'text' },
              },
            },
          },
          edge: {
            ...base.codebook.edge,
            family: {
              name: 'Family',
              color: 'edge-color-seq-1',
              variables: {
                relType: {
                  name: 'RelType',
                  type: 'categorical',
                  options: [{ label: 'Parent', value: 'parent' }],
                },
                active: { name: 'Active', type: 'boolean' },
                gestational: { name: 'Gestational', type: 'boolean' },
              },
            },
          },
        },
        stages: [
          {
            id: 'pedigree1',
            type: 'FamilyPedigree',
            label: 'Family Tree',
            censusPrompt: 'Build your family tree',
            nodeConfig: {
              type: 'person',
              nodeLabelVariable: 'name',
              egoVariable: 'isEgo',
              relationshipVariable: 'relationship',
              form: [{ variable: formVariable, prompt: 'Question' }],
            },
            edgeConfig: {
              type: 'family',
              relationshipTypeVariable: 'relType',
              isActiveVariable: 'active',
              isGestationalCarrierVariable: 'gestational',
            },
          },
        ],
      };
    };

    it('rejects a nodeConfig.form variable id that collides with a reserved key', () => {
      const protocol = buildPedigreeProtocol('role');
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes('reserved'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('accepts a nodeConfig.form variable id that does not collide', () => {
      const protocol = buildPedigreeProtocol('relationship');
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });
});
