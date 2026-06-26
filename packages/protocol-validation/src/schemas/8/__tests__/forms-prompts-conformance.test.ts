import { describe, expect, it } from 'vitest';

import type { NodeDefinition } from '~/schemas/8/codebook/definitions';

import ProtocolSchemaV8 from '../schema';

/**
 * Schema-conformance refinements for forms and prompts:
 * - FormSchema.fields must be non-empty (node-creating + alter/alter-edge forms)
 * - EgoForm/AlterForm/AlterEdgeForm forms must not carry a (never-rendered) title
 * - TieStrengthCensus prompt negativeLabel must be non-empty
 * - CategoricalBin prompt otherVariablePrompt required when otherVariable set
 * - NameGenerator(QuickAdd) behaviours: maxNodes>=minNodes, maxNodes>=1, minNodes>=0
 *
 * The codebook here keeps variable record keys unique per entity type so the
 * cross-entity record-key refinement never masks the assertion under test.
 */
const createProtocol = (stages: unknown[]) => ({
  name: 'Test Protocol',
  schemaVersion: 8 as const,
  codebook: {
    ego: {
      variables: {
        egoName: { name: 'EgoName', type: 'text' },
      },
    },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' } as NodeDefinition['shape'],
        variables: {
          personName: { name: 'Name', type: 'text' },
          personOther: { name: 'Other', type: 'text' },
          personCategory: {
            name: 'Category',
            type: 'categorical',
            options: [
              { label: 'Friend', value: 'friend' },
              { label: 'Family', value: 'family' },
            ],
          },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          closeness: {
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not Close', value: 1 },
              { label: 'Very Close', value: 2 },
            ],
          },
        },
      },
    },
  },
  stages,
});

describe('Forms & prompts schema conformance', () => {
  describe('empty form.fields rejected', () => {
    it('rejects a NameGenerator with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'ng1',
          type: 'NameGenerator',
          label: 'Generate Names',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [] },
          prompts: [{ id: 'p1', text: 'Who do you know?' }],
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects an AlterForm with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'af1',
          type: 'AlterForm',
          label: 'Alter Form',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [] },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects an AlterEdgeForm with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'aef1',
          type: 'AlterEdgeForm',
          label: 'Alter Edge Form',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [] },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects an EgoForm with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'ef1',
          type: 'EgoForm',
          label: 'Ego Form',
          form: { fields: [] },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('accepts a NameGenerator with at least one field', () => {
      const protocol = createProtocol([
        {
          id: 'ng1',
          type: 'NameGenerator',
          label: 'Generate Names',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'personName', prompt: 'Enter name' }] },
          prompts: [{ id: 'p1', text: 'Who do you know?' }],
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });
  });

  describe('title-less forms for Ego/Alter/AlterEdge', () => {
    it('rejects an EgoForm whose form carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'ef1',
          type: 'EgoForm',
          label: 'Ego Form',
          form: {
            title: 'Tell us about yourself',
            fields: [{ variable: 'egoName', prompt: 'Your name?' }],
          },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects an AlterForm whose form carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'af1',
          type: 'AlterForm',
          label: 'Alter Form',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'About this person',
            fields: [{ variable: 'personName', prompt: 'Their name?' }],
          },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects an AlterEdgeForm whose form carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'aef1',
          type: 'AlterEdgeForm',
          label: 'Alter Edge Form',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            title: 'About this relationship',
            fields: [{ variable: 'closeness', prompt: 'How close?' }],
          },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('accepts a title-less EgoForm', () => {
      const protocol = createProtocol([
        {
          id: 'ef1',
          type: 'EgoForm',
          label: 'Ego Form',
          form: { fields: [{ variable: 'egoName', prompt: 'Your name?' }] },
          introductionPanel: { title: 'Intro', text: 'text' },
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });

    it('still accepts a NameGenerator form that carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'ng1',
          type: 'NameGenerator',
          label: 'Generate Names',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'Add a person',
            fields: [{ variable: 'personName', prompt: 'Enter name' }],
          },
          prompts: [{ id: 'p1', text: 'Who do you know?' }],
        },
      ]);

      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });
  });

  describe('TieStrengthCensus negativeLabel', () => {
    const tieStrengthStage = (negativeLabel: string) => ({
      id: 'tsc1',
      type: 'TieStrengthCensus',
      label: 'Tie Strength',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Intro', text: 'text' },
      prompts: [
        {
          id: 'p1',
          text: 'How close?',
          createEdge: 'knows',
          edgeVariable: 'closeness',
          negativeLabel,
        },
      ],
    });

    it('rejects an empty-string negativeLabel', () => {
      const protocol = createProtocol([tieStrengthStage('')]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('accepts a non-empty negativeLabel', () => {
      const protocol = createProtocol([tieStrengthStage('Not close')]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });
  });

  describe('CategoricalBin otherVariablePrompt', () => {
    const categoricalBinStage = (prompt: Record<string, unknown>) => ({
      id: 'cb1',
      type: 'CategoricalBin',
      label: 'Categorical Bin',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Pick a category',
          variable: 'personCategory',
          ...prompt,
        },
      ],
    });

    it('rejects otherVariable set without otherVariablePrompt', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariable: 'personOther',
          otherOptionLabel: 'Other',
        }),
      ]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('accepts otherVariable set with otherVariablePrompt present', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariable: 'personOther',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        }),
      ]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });

    it('accepts a prompt with no otherVariable at all', () => {
      const protocol = createProtocol([categoricalBinStage({})]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });
  });

  describe('NameGenerator(QuickAdd) behaviours node-limit refinement', () => {
    const nameGeneratorStage = (behaviours: Record<string, number>) => ({
      id: 'ng1',
      type: 'NameGenerator',
      label: 'Generate Names',
      subject: { entity: 'node', type: 'person' },
      form: { fields: [{ variable: 'personName', prompt: 'Enter name' }] },
      prompts: [{ id: 'p1', text: 'Who do you know?' }],
      behaviours,
    });

    const quickAddStage = (behaviours: Record<string, number>) => ({
      id: 'ngqa1',
      type: 'NameGeneratorQuickAdd',
      label: 'Quick Add',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'personName',
      prompts: [{ id: 'p1', text: 'Who do you know?' }],
      behaviours,
    });

    it('rejects NameGenerator with minNodes > maxNodes', () => {
      const protocol = createProtocol([
        nameGeneratorStage({ minNodes: 5, maxNodes: 3 }),
      ]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects NameGenerator with maxNodes: 0', () => {
      const protocol = createProtocol([nameGeneratorStage({ maxNodes: 0 })]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects NameGenerator with negative minNodes', () => {
      const protocol = createProtocol([nameGeneratorStage({ minNodes: -1 })]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects NameGeneratorQuickAdd with minNodes > maxNodes', () => {
      const protocol = createProtocol([
        quickAddStage({ minNodes: 5, maxNodes: 3 }),
      ]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('rejects NameGeneratorQuickAdd with maxNodes: 0', () => {
      const protocol = createProtocol([quickAddStage({ maxNodes: 0 })]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
    });

    it('accepts NameGenerator with consistent minNodes/maxNodes', () => {
      const protocol = createProtocol([
        nameGeneratorStage({ minNodes: 1, maxNodes: 5 }),
      ]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });

    it('accepts NameGeneratorQuickAdd with only maxNodes set', () => {
      const protocol = createProtocol([quickAddStage({ maxNodes: 5 })]);
      expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
    });
  });
});
