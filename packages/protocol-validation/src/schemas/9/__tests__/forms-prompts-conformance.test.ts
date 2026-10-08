import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { localized } from '../../../utils/test-utils.ts';
import type { NodeDefinition } from '../codebook/definitions.ts';
import ProtocolSchemaV9 from '../schema.ts';

/**
 * Schema-conformance refinements for forms and prompts:
 * - FormSchema.fields must be non-empty (node-creating + alter/alter-edge forms)
 * - EgoForm/AlterForm/AlterEdgeForm forms must not carry a (never-rendered) title
 * - TieStrengthCensus prompt negativeLabel must be non-empty
 * - CategoricalBin prompt otherVariablePrompt required when otherVariable set
 * - CategoricalBin prompt otherOptionLabel/otherVariablePrompt require otherVariable
 * - OrdinalBin prompt color restricted to the ord-color-seq palette
 * - NameGenerator(QuickAdd) behaviours: maxNodes>=minNodes, maxNodes>=1, minNodes>=0
 *
 * The codebook here keeps variable record keys unique per entity type so the
 * cross-entity record-key refinement never masks the assertion under test.
 */
const createProtocol = (stages: unknown[]) => ({
  name: 'Test Protocol',
  schemaVersion: 9 as const,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    ego: {
      variables: {
        egoName: {
          name: 'EgoName',
          label: 'EgoName',
          type: 'text',
          component: 'Text',
        },
      },
    },
    node: {
      person: {
        name: 'Person',
        label: localized('Person'),
        color: 'node-color-seq-1',
        shape: { default: 'circle' } as NodeDefinition['shape'],
        variables: {
          personName: {
            name: 'Name',
            label: 'Name',
            type: 'text',
            component: 'Text',
          },
          personOther: {
            name: 'Other',
            label: 'Other',
            type: 'text',
          },
          personCategory: {
            name: 'Category',
            label: 'Category',
            type: 'categorical',
            options: [
              { label: localized('Friend'), value: 'friend' },
              { label: localized('Family'), value: 'family' },
            ],
          },
          personRating: {
            name: 'Rating',
            label: 'Rating',
            type: 'ordinal',
            options: [
              { label: localized('Low'), value: 1 },
              { label: localized('High'), value: 2 },
            ],
          },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        label: localized('Knows'),
        color: 'edge-color-seq-1',
        variables: {
          closeness: {
            name: 'Closeness',
            label: 'Closeness',
            type: 'ordinal',
            options: [
              { label: localized('Not Close'), value: 1 },
              { label: localized('Very Close'), value: 2 },
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
          label: localized('Generate Names'),
          subject: { entity: 'node', type: 'person' },
          form: { title: localized('Add person'), fields: [] },
          prompts: [{ id: 'p1', text: localized('Who do you know?') }],
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects an AlterForm with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'af1',
          type: 'AlterForm',
          label: localized('Alter Form'),
          subject: { entity: 'node', type: 'person' },
          form: { fields: [] },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects an AlterEdgeForm with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'aef1',
          type: 'AlterEdgeForm',
          label: localized('Alter Edge Form'),
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [] },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects an EgoForm with empty form.fields', () => {
      const protocol = createProtocol([
        {
          id: 'ef1',
          type: 'EgoForm',
          label: localized('Ego Form'),
          form: { fields: [] },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts a NameGenerator with at least one field', () => {
      const protocol = createProtocol([
        {
          id: 'ng1',
          type: 'NameGenerator',
          label: localized('Generate Names'),
          subject: { entity: 'node', type: 'person' },
          form: {
            title: localized('Add person'),
            fields: [
              { variable: 'personName', prompt: localized('Enter name') },
            ],
          },
          prompts: [{ id: 'p1', text: localized('Who do you know?') }],
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });

  describe('title-less forms for Ego/Alter/AlterEdge', () => {
    it('rejects an EgoForm whose form carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'ef1',
          type: 'EgoForm',
          label: localized('Ego Form'),
          form: {
            title: localized('Tell us about yourself'),
            fields: [{ variable: 'egoName', prompt: localized('Your name?') }],
          },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects an AlterForm whose form carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'af1',
          type: 'AlterForm',
          label: localized('Alter Form'),
          subject: { entity: 'node', type: 'person' },
          form: {
            title: localized('About this person'),
            fields: [
              { variable: 'personName', prompt: localized('Their name?') },
            ],
          },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects an AlterEdgeForm whose form carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'aef1',
          type: 'AlterEdgeForm',
          label: localized('Alter Edge Form'),
          subject: { entity: 'edge', type: 'knows' },
          form: {
            title: localized('About this relationship'),
            fields: [
              { variable: 'closeness', prompt: localized('How close?') },
            ],
          },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts a title-less EgoForm', () => {
      const protocol = createProtocol([
        {
          id: 'ef1',
          type: 'EgoForm',
          label: localized('Ego Form'),
          form: {
            fields: [{ variable: 'egoName', prompt: localized('Your name?') }],
          },
          introductionPanel: {
            title: localized('Intro'),
            text: localized('text'),
          },
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });

    it('still accepts a NameGenerator form that carries a title', () => {
      const protocol = createProtocol([
        {
          id: 'ng1',
          type: 'NameGenerator',
          label: localized('Generate Names'),
          subject: { entity: 'node', type: 'person' },
          form: {
            title: localized('Add a person'),
            fields: [
              { variable: 'personName', prompt: localized('Enter name') },
            ],
          },
          prompts: [{ id: 'p1', text: localized('Who do you know?') }],
        },
      ]);

      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });

  describe('TieStrengthCensus negativeLabel', () => {
    const tieStrengthStage = (negativeLabel: string) => ({
      id: 'tsc1',
      type: 'TieStrengthCensus',
      label: localized('Tie Strength'),
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: localized('Intro'), text: localized('text') },
      prompts: [
        {
          id: 'p1',
          text: localized('How close?'),
          createEdge: 'knows',
          edgeVariable: 'closeness',
          negativeLabel: localized(negativeLabel),
        },
      ],
    });

    it('rejects an empty-string negativeLabel', () => {
      const protocol = createProtocol([tieStrengthStage('')]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts a non-empty negativeLabel', () => {
      const protocol = createProtocol([tieStrengthStage('Not close')]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });

  describe('CategoricalBin otherVariablePrompt', () => {
    const categoricalBinStage = (prompt: Record<string, unknown>) => ({
      id: 'cb1',
      type: 'CategoricalBin',
      label: localized('Categorical Bin'),
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: localized('Pick a category'),
          variable: 'personCategory',
          ...prompt,
        },
      ],
    });

    it('rejects otherVariable set without otherVariablePrompt', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariable: 'personOther',
          otherOptionLabel: localized('Other'),
        }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts otherVariable set with otherVariablePrompt present', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariable: 'personOther',
          otherOptionLabel: localized('Other'),
          otherVariablePrompt: localized('Please specify'),
        }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });

    it('accepts a prompt with no otherVariable at all', () => {
      const protocol = createProtocol([categoricalBinStage({})]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });

    it('rejects otherOptionLabel set without otherVariable', () => {
      const protocol = createProtocol([
        categoricalBinStage({ otherOptionLabel: localized('Other') }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects otherVariablePrompt set without otherVariable', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariablePrompt: localized('Please specify'),
        }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects otherVariable set without otherOptionLabel', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariable: 'personOther',
          otherVariablePrompt: localized('Please specify'),
        }),
      ]);
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes('otherOptionLabel is required'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('rejects an empty-string otherVariable with a targeted message', () => {
      const protocol = createProtocol([
        categoricalBinStage({ otherVariable: '' }),
      ]);
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes('otherVariable must name an attribute'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('rejects an empty-string otherOptionLabel without otherVariable', () => {
      const protocol = createProtocol([
        categoricalBinStage({ otherOptionLabel: localized('') }),
      ]);
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes('otherOptionLabel requires otherVariable'),
        );
        expect(issue).toBeDefined();
      }
    });

    it('parses the other-option fields into the narrowed variant', () => {
      const protocol = createProtocol([
        categoricalBinStage({
          otherVariable: 'personOther',
          otherOptionLabel: localized('Other'),
          otherVariablePrompt: localized('Please specify'),
        }),
      ]);
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
      if (result.success) {
        const stage = result.data.stages[0];
        if (stage?.type !== 'CategoricalBin') {
          throw new Error('expected a CategoricalBin stage');
        }
        const prompt = stage.prompts[0];
        // The pipe narrows the static type: proving otherVariable is set
        // proves the label and follow-up prompt exist, with no cast.
        if (prompt && prompt.otherVariable !== undefined) {
          const label: Record<string, string> = prompt.otherOptionLabel;
          const followUp: Record<string, string> = prompt.otherVariablePrompt;
          expect(label).toEqual(localized('Other'));
          expect(followUp).toEqual(localized('Please specify'));
        } else {
          throw new Error('expected the other-option variant');
        }
      }
    });
  });

  describe('OrdinalBin prompt color', () => {
    const ordinalBinStage = (prompt: Record<string, unknown>) => ({
      id: 'ob1',
      type: 'OrdinalBin',
      label: localized('Ordinal Bin'),
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: localized('Rate this'),
          variable: 'personRating',
          ...prompt,
        },
      ],
    });

    it('accepts a color from the ord-color-seq palette', () => {
      const protocol = createProtocol([
        ordinalBinStage({ color: 'ord-color-seq-5' }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });

    it('rejects a prompt with no color', () => {
      const protocol = createProtocol([ordinalBinStage({})]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects a color outside the ord-color-seq palette', () => {
      const protocol = createProtocol([
        ordinalBinStage({ color: 'not-a-real-color' }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });
  });

  describe('NameGenerator(QuickAdd) behaviours node-limit refinement', () => {
    const nameGeneratorStage = (behaviours: Record<string, number>) => ({
      id: 'ng1',
      type: 'NameGenerator',
      label: localized('Generate Names'),
      subject: { entity: 'node', type: 'person' },
      form: {
        title: localized('Add person'),
        fields: [{ variable: 'personName', prompt: localized('Enter name') }],
      },
      prompts: [{ id: 'p1', text: localized('Who do you know?') }],
      behaviours,
    });

    const quickAddStage = (behaviours: Record<string, number>) => ({
      id: 'ngqa1',
      type: 'NameGeneratorQuickAdd',
      label: localized('Quick Add'),
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'personName',
      prompts: [{ id: 'p1', text: localized('Who do you know?') }],
      behaviours,
    });

    it('rejects NameGenerator with minNodes > maxNodes', () => {
      const protocol = createProtocol([
        nameGeneratorStage({ minNodes: 5, maxNodes: 3 }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects NameGenerator with maxNodes: 0', () => {
      const protocol = createProtocol([nameGeneratorStage({ maxNodes: 0 })]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects NameGenerator with negative minNodes', () => {
      const protocol = createProtocol([nameGeneratorStage({ minNodes: -1 })]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects NameGeneratorQuickAdd with minNodes > maxNodes', () => {
      const protocol = createProtocol([
        quickAddStage({ minNodes: 5, maxNodes: 3 }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects NameGeneratorQuickAdd with maxNodes: 0', () => {
      const protocol = createProtocol([quickAddStage({ maxNodes: 0 })]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts NameGenerator with consistent minNodes/maxNodes', () => {
      const protocol = createProtocol([
        nameGeneratorStage({ minNodes: 1, maxNodes: 5 }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });

    it('accepts NameGeneratorQuickAdd with only maxNodes set', () => {
      const protocol = createProtocol([quickAddStage({ maxNodes: 5 })]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });

  describe('prompt text non-empty', () => {
    const nameGeneratorStage = (text: string) => ({
      id: 'ng1',
      type: 'NameGenerator',
      label: localized('Generate Names'),
      subject: { entity: 'node', type: 'person' },
      form: {
        title: localized('Add person'),
        fields: [{ variable: 'personName', prompt: localized('Enter name') }],
      },
      prompts: [{ id: 'p1', text: localized(text) }],
    });

    it('rejects a prompt with an empty text', () => {
      const protocol = createProtocol([nameGeneratorStage('')]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts a prompt with a non-empty text', () => {
      const protocol = createProtocol([nameGeneratorStage('Who do you know?')]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });

  describe('form field prompt non-empty', () => {
    const nameGeneratorStage = (prompt: string) => ({
      id: 'ng1',
      type: 'NameGenerator',
      label: localized('Generate Names'),
      subject: { entity: 'node', type: 'person' },
      form: {
        title: localized('Add person'),
        fields: [{ variable: 'personName', prompt: localized(prompt) }],
      },
      prompts: [{ id: 'p1', text: localized('Who do you know?') }],
    });

    it('rejects a form field with an empty prompt', () => {
      const protocol = createProtocol([nameGeneratorStage('')]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts a form field with a non-empty prompt', () => {
      const protocol = createProtocol([nameGeneratorStage('Enter name')]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });

  describe('introductionPanel title/text non-empty', () => {
    const alterFormStage = (introductionPanel: {
      title: Record<string, string>;
      text: Record<string, string>;
    }) => ({
      id: 'af1',
      type: 'AlterForm',
      label: localized('Alter Form'),
      subject: { entity: 'node', type: 'person' },
      form: {
        fields: [{ variable: 'personName', prompt: localized('Their name?') }],
      },
      introductionPanel,
    });

    it('rejects an introductionPanel with an empty title', () => {
      const protocol = createProtocol([
        alterFormStage({ title: localized(''), text: localized('Some text') }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('rejects an introductionPanel with an empty text', () => {
      const protocol = createProtocol([
        alterFormStage({ title: localized('Intro'), text: localized('') }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(false);
    });

    it('accepts an introductionPanel with non-empty title and text', () => {
      const protocol = createProtocol([
        alterFormStage({
          title: localized('Intro'),
          text: localized('Some text'),
        }),
      ]);
      expect(
        ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success,
      ).toBe(true);
    });
  });
});
