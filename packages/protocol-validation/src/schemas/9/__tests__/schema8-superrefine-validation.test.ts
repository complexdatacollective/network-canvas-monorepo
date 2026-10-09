import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  createBaseProtocol,
  localized,
  localizedOptions,
} from '../../../utils/test-utils.ts';
import {
  CategoricalColorSequence,
  EdgeColorSequence,
  NodeColorSequence,
  OrdinalColorSequence,
} from '../color-reference.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import ProtocolSchemaV9 from '../schema.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from './pedigreeGenderFixtures.ts';

/**
 * Comprehensive tests for Protocol Schema V8 superrefine validation behavior
 * This test suite focuses on the complex validation logic in the superRefine function
 * that validates cross-references between different parts of the protocol.
 */
describe('Protocol Schema V8 - Superrefine Validation', () => {
  // Base valid protocol for testing variations
  const baseValidProtocol = createBaseProtocol();

  // Name generator prompts may only stamp boolean attributes, which the base
  // protocol does not define; an encrypted text variable stands in for the
  // most sensitive thing a prompt must never overwrite.
  const personDefinition = baseValidProtocol.codebook.node.person;
  const protocolWithFlagVariables = {
    ...baseValidProtocol,
    codebook: {
      ...baseValidProtocol.codebook,
      node: {
        ...baseValidProtocol.codebook.node,
        person: {
          ...personDefinition,
          variables: {
            ...personDefinition.variables,
            closeFriend: {
              name: 'Close_Friend',
              label: 'Close friend',
              type: 'boolean',
              component: 'Boolean',
            },
            coworker: {
              name: 'Coworker',
              label: 'Coworker',
              type: 'boolean',
              component: 'Toggle',
            },
            secretName: {
              name: 'Secret_Name',
              label: 'Secret name',
              type: 'text',
              component: 'Text',
              encrypted: true,
            },
          },
        },
      },
    },
  };

  describe('Stage Subject Validation', () => {
    it('validates protocol with valid stage subjects', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(baseValidProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects stage with non-existent node type', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            subject: {
              entity: 'node',
              type: 'nonexistent',
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        // The new validator emits errors in validator order; use find() to locate the subject error
        const subjectError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Stage subject is not defined in the codebook',
          ),
        );
        expect(subjectError).toBeDefined();
        expect(subjectError?.path).toEqual(['stages', 0, 'subject']);
      }
    });

    it('rejects stage with non-existent edge type', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'edgeForm1',
            type: 'AlterEdgeForm',
            label: localized('Edge Form'),
            subject: {
              entity: 'edge',
              type: 'nonexistent',
            },
            form: {
              fields: [],
            },
            introductionPanel: {
              title: localized('Edge Form Intro'),
              text: localized('Introduction text for edge form.'),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const subjectError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Stage subject is not defined in the codebook',
          ),
        );
        expect(subjectError).toBeDefined();
        expect(subjectError?.path).toEqual(['stages', 0, 'subject']);
      }
    });

    it('validates ego subject for EgoForm stages', () => {
      const egoFormProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'egoForm1',
            type: 'EgoForm',
            label: localized('Ego Form'),
            form: {
              fields: [
                {
                  variable: 'egoName',
                  prompt: localized('Enter your name'),
                },
              ],
            },
            introductionPanel: {
              title: localized('Ego Form Intro'),
              text: localized('Introduction text for ego form.'),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(egoFormProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects ego subject when ego is not defined in codebook', () => {
      const protocolWithoutEgo = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          ego: undefined,
        },
        stages: [
          {
            id: 'egoForm1',
            type: 'EgoForm',
            label: localized('Ego Form'),
            form: {
              fields: [
                {
                  variable: 'egoName',
                  prompt: localized('Enter your name'),
                },
              ],
            },
            introductionPanel: {
              title: localized('Ego Form Intro'),
              text: localized('Introduction text for ego form.'),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithoutEgo),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        // The form field validation should fail because ego variables don't exist
        const formFieldError = result.error.issues.find((issue) =>
          issue.message.includes('does not exist in the codebook'),
        );
        expect(formFieldError).toBeDefined();
      }
    });
  });

  describe('Form Field Validation', () => {
    it('validates form fields with correct variable references for node entities', () => {
      const protocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'name',
                  prompt: localized('Enter name'),
                },
                {
                  variable: 'age',
                  prompt: localized('Enter age'),
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('rejects form field with non-existent variable for node entity', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'nonexistentVariable',
                  prompt: localized('Enter something'),
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]?.message).toBe(
          'The attribute "nonexistentVariable" does not exist in the codebook',
        );
        expect(result.error.issues[0]?.path).toEqual([
          'stages',
          0,
          'form',
          'fields',
          0,
          'variable',
        ]);
      }
    });

    it('validates form fields for EgoForm stages', () => {
      const egoFormProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'egoForm1',
            type: 'EgoForm',
            label: localized('Ego Form'),
            form: {
              fields: [
                {
                  variable: 'egoName',
                  prompt: localized('Enter your name'),
                },
                {
                  variable: 'egoAge',
                  prompt: localized('Enter your age'),
                },
              ],
            },
            introductionPanel: {
              title: localized('Ego Form Intro'),
              text: localized('Introduction text for ego form.'),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(egoFormProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects form field with non-existent ego variable', () => {
      const invalidEgoFormProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'egoForm1',
            type: 'EgoForm',
            label: localized('Ego Form'),
            form: {
              fields: [
                {
                  variable: 'nonexistentEgoVariable',
                  prompt: localized('Enter something'),
                },
              ],
            },
            introductionPanel: {
              title: localized('Ego Form Intro'),
              text: localized('Introduction text for ego form.'),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidEgoFormProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const formFieldError = result.error.issues.find((issue) =>
          issue.message.includes('does not exist in the codebook'),
        );
        expect(formFieldError).toBeDefined();
        expect(formFieldError?.path).toEqual([
          'stages',
          0,
          'form',
          'fields',
          0,
          'variable',
        ]);
      }
    });

    it('validates form fields for edge entities', () => {
      const edgeFormProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'edgeForm1',
            type: 'AlterEdgeForm',
            label: localized('Edge Form'),
            subject: {
              entity: 'edge',
              type: 'knows',
            },
            form: {
              fields: [
                {
                  variable: 'closeness',
                  prompt: localized('How close are you?'),
                },
                {
                  variable: 'duration',
                  prompt: localized('How long have you known them?'),
                },
              ],
            },
            introductionPanel: {
              title: localized('Edge Form Intro'),
              text: localized('Introduction text for edge form.'),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(edgeFormProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects form field with variable from wrong entity type', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            subject: {
              entity: 'node',
              type: 'person',
            },
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'department', // This variable exists on 'colleague' not 'person'
                  prompt: localized('Enter department'),
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const formFieldError = result.error.issues.find((issue) =>
          issue.message.includes('does not exist in the codebook'),
        );
        expect(formFieldError).toBeDefined();
      }
    });
  });

  describe('Duplicate ID Validation', () => {
    it('rejects protocols with duplicate stage IDs', () => {
      const protocolWithDuplicateStageIds = {
        ...baseValidProtocol,
        stages: [
          baseValidProtocol.stages[0],
          {
            ...baseValidProtocol.stages[0],
            label: localized('Duplicate Stage'), // Different label, same ID
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithDuplicateStageIds),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]?.message).toBe(
          'Stages contain duplicate ID "nameGenerator1"',
        );
        expect(result.error.issues[0]?.path).toEqual(['stages']);
      }
    });

    it('rejects protocols with duplicate prompt IDs within a stage', () => {
      const protocolWithDuplicatePromptIds = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            prompts: [
              { id: 'prompt1', text: localized('First prompt') },
              { id: 'prompt1', text: localized('Duplicate ID prompt') },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithDuplicatePromptIds),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const duplicateError = result.error.issues.find((issue) =>
          issue.message.includes('Prompts contain duplicate ID "prompt1"'),
        );
        expect(duplicateError).toBeDefined();
      }
    });
  });

  describe('Prompt Variable Validation', () => {
    it('validates prompt variable references for ordinal bin stages', () => {
      const ordinalBinProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'ordinalBin1',
            type: 'OrdinalBin',
            label: localized('Ordinal Bin'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Sort by strength'),
                variable: 'strength',
                color: 'ord-color-seq-1',
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(ordinalBinProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects prompt with non-existent variable reference', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'ordinalBin1',
            type: 'OrdinalBin',
            label: localized('Ordinal Bin'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Sort by something'),
                variable: 'nonexistentVariable',
                color: 'ord-color-seq-1',
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const variableError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(variableError).toBeDefined();
        expect(variableError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'variable',
        ]);
      }
    });

    it('validates otherVariable for categorical bin stages', () => {
      const categoricalBinProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'categoricalBin1',
            type: 'CategoricalBin',
            label: localized('Categorical Bin'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Sort by category'),
                variable: 'category',
                otherVariable: 'name',
                otherOptionLabel: localized('Other'),
                otherVariablePrompt: localized('Please specify'),
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(categoricalBinProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects a non-text CategoricalBin otherVariable at the reference path', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage({
          ...baseValidProtocol,
          stages: [
            {
              id: 'categoricalBin1',
              type: 'CategoricalBin',
              label: localized('Categorical Bin'),
              subject: {
                entity: 'node',
                type: 'person',
              },
              prompts: [
                {
                  id: 'prompt1',
                  text: localized('Sort by category'),
                  variable: 'category',
                  otherVariable: 'category',
                  otherOptionLabel: localized('Other'),
                  otherVariablePrompt: localized('Please specify'),
                },
              ],
            },
          ],
        }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((candidate) =>
          candidate.message.includes(
            'The attribute "category" must be of type text',
          ),
        );
        expect(issue?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'otherVariable',
        ]);
      }
    });

    it('rejects prompt with non-existent otherVariable reference', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'categoricalBin1',
            type: 'CategoricalBin',
            label: localized('Categorical Bin'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Sort by category'),
                variable: 'category',
                otherVariable: 'nonexistentVariable',
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const otherVariableError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(otherVariableError).toBeDefined();
        expect(otherVariableError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'otherVariable',
        ]);
      }
    });
  });

  describe('CreateEdge Reference Validation', () => {
    it('validates createEdge references in prompts', () => {
      const dyadCensusProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'dyadCensus1',
            type: 'DyadCensus',
            label: localized('Dyad Census'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Do these people know each other?'),
                createEdge: 'knows',
              },
            ],
            introductionPanel: {
              title: localized('Dyad Census'),
              text: localized(
                "In the next screens, you will be shown pairs of alters. By answering 'Yes' to the questions, an edge between both alters will then be created.",
              ),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(dyadCensusProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects createEdge reference to non-existent edge type', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'dyadCensus1',
            type: 'DyadCensus',
            label: localized('Dyad Census'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Do these people know each other?'),
                createEdge: 'nonexistentEdge',
              },
            ],
            introductionPanel: {
              title: localized('Dyad Census'),
              text: localized(
                "In the next screens, you will be shown pairs of alters. By answering 'Yes' to the questions, an edge between both alters will then be created.",
              ),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const createEdgeError = result.error.issues.find((issue) =>
          issue.message.includes(
            '"nonexistentEdge" definition for createEdge not found in codebook["edge"]',
          ),
        );
        expect(createEdgeError).toBeDefined();
        expect(createEdgeError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'createEdge',
        ]);
      }
    });

    it('rejects a TieStrengthCensus decline label that shows nothing', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage({
          ...baseValidProtocol,
          stages: [
            {
              id: 'tieStrength1',
              type: 'TieStrengthCensus',
              label: localized('Tie Strength Census'),
              subject: { entity: 'node', type: 'person' },
              prompts: [
                {
                  id: 'prompt1',
                  text: localized('How close are these people?'),
                  createEdge: 'knows',
                  edgeVariable: 'closeness',
                  negativeLabel: localized('   '),
                },
              ],
              introductionPanel: {
                title: localized('Tie Strength Census'),
                text: localized('Rate each pair.'),
              },
            },
          ],
        }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues.map(({ path }) => path)).toContainEqual([
        'stages',
        0,
        'prompts',
        0,
        'negativeLabel',
        'en',
      ]);
    });

    it('validates edgeVariable for TieStrengthCensus stages', () => {
      const tieStrengthCensusProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'tieStrength1',
            type: 'TieStrengthCensus',
            label: localized('Tie Strength Census'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('How close are these people?'),
                createEdge: 'knows',
                edgeVariable: 'closeness',
                negativeLabel: localized('Not connected'),
              },
            ],
            introductionPanel: {
              title: localized('Tie Strength Census'),
              text: localized(
                'In the next screens, you will be shown pairs of alters. Please rate the strength of their relationship.',
              ),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(tieStrengthCensusProtocol),
      );
      expect(result.success).toBe(true);
    });

    it("rejects edgeVariable that doesn't exist in the edge type", () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'tieStrength1',
            type: 'TieStrengthCensus',
            label: localized('Tie Strength Census'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('How close are these people?'),
                createEdge: 'knows',
                edgeVariable: 'nonexistentVariable',
                negativeLabel: localized('Not connected'),
              },
            ],
            introductionPanel: {
              title: localized('Tie Strength Census'),
              text: localized(
                'In the next screens, you will be shown pairs of alters. Please rate the strength of their relationship.',
              ),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const edgeVariableError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(edgeVariableError).toBeDefined();
        expect(edgeVariableError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'edgeVariable',
        ]);
      }
    });

    it("rejects edgeVariable that is not of type 'ordinal'", () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'tieStrength1',
            type: 'TieStrengthCensus',
            label: localized('Tie Strength Census'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('How close are these people?'),
                createEdge: 'knows',
                edgeVariable: 'duration', // This is a number, not ordinal
                negativeLabel: localized('Not connected'),
              },
            ],
            introductionPanel: {
              title: localized('Tie Strength Census'),
              text: localized(
                'In the next screens, you will be shown pairs of alters. Please rate the strength of their relationship.',
              ),
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const typeError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "duration" must be of type ordinal',
          ),
        );
        expect(typeError).toBeDefined();
        expect(typeError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'edgeVariable',
        ]);
      }
    });
  });

  describe('Layout Variable Validation', () => {
    it('validates string layoutVariable reference', () => {
      const sociogramProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: localized('Sociogram'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            background: {
              concentricCircles: 4,
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Position nodes'),
                layout: {
                  layoutVariable: 'layoutPosition',
                },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(sociogramProtocol),
      );
      expect(result.success).toBe(true);
    });

    it("rejects string layoutVariable that doesn't exist", () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: localized('Sociogram'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            background: {
              concentricCircles: 4,
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Position nodes'),
                layout: {
                  layoutVariable: 'nonexistentVariable',
                },
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const layoutError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(layoutError).toBeDefined();
        expect(layoutError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'layout',
          'layoutVariable',
        ]);
      }
    });

    // Object layoutVariable support has been removed - only strings are supported
  });

  describe('Additional Attributes Validation', () => {
    const nameGeneratorWith = (
      additionalAttributes: { variable: string; value: boolean }[],
    ) => ({
      ...protocolWithFlagVariables,
      stages: [
        {
          id: 'nameGen1',
          type: 'NameGenerator',
          label: localized('Name Generator'),
          subject: { entity: 'node', type: 'person' },
          form: {
            title: localized('Add person'),
            fields: [{ variable: 'name', prompt: localized('Enter name') }],
          },
          prompts: [
            {
              id: 'prompt1',
              text: localized('Who do you know?'),
              additionalAttributes,
            },
          ],
        },
      ],
    });

    it.each([
      ['a number', 'age'],
      ['a categorical', 'category'],
      ['a text', 'name'],
      ['an encrypted text', 'secretName'],
    ])(
      'rejects additionalAttributes that target %s attribute',
      (_label, variable) => {
        const result = ProtocolSchemaV9.safeParse(
          nameGeneratorWith([{ variable, value: true }]),
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          const typeError = result.error.issues.find(
            (issue) =>
              issue.message ===
              `The attribute "${variable}" must be of type boolean`,
          );
          expect(typeError?.path).toEqual([
            'stages',
            0,
            'prompts',
            0,
            'additionalAttributes',
            0,
            'variable',
          ]);
        }
      },
    );

    it('validates additionalAttributes with correct variable references', () => {
      const nameGeneratorProtocol = {
        ...protocolWithFlagVariables,
        stages: [
          {
            id: 'nameGen1',
            type: 'NameGenerator',
            label: localized('Name Generator'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'name',
                  prompt: localized('Enter name'),
                },
              ],
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Who do you know?'),
                additionalAttributes: [
                  { variable: 'closeFriend', value: true },
                  { variable: 'coworker', value: false },
                ],
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(nameGeneratorProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('rejects additionalAttributes with non-existent variables', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'nameGen1',
            type: 'NameGenerator',
            label: localized('Name Generator'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'name',
                  prompt: localized('Enter name'),
                },
              ],
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Who do you know?'),
                additionalAttributes: [
                  { variable: 'nonexistentVariable', value: true },
                  { variable: 'anotherNonexistent', value: false },
                ],
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const attributeError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(attributeError).toBeDefined();
        expect(attributeError?.path).toEqual([
          'stages',
          0,
          'prompts',
          0,
          'additionalAttributes',
          0,
          'variable',
        ]);
      }
    });
  });

  // Edges Restrict Origin Validation removed - feature was abandoned

  describe('Filter Rules Validation', () => {
    it('validates filter rules with correct entity and attribute references', () => {
      // Node/edge rules belong in a stage filter; ego rules are only valid in
      // skipLogic/panel/query filters, so the ego rule lives in skipLogic here.
      const protocolWithFilters = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'age',
                    operator: 'GREATER_THAN',
                    value: 18,
                  },
                },
              ],
            },
            skipLogic: {
              action: 'SHOW',
              filter: {
                rules: [
                  {
                    id: 'rule2',
                    type: 'ego',
                    options: {
                      attribute: 'egoAge',
                      operator: 'LESS_THAN',
                      value: 65,
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithFilters),
      );
      expect(result.success).toBe(true);
    });

    it('rejects filter rule with non-existent entity type', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'nonexistentEntityType',
                    attribute: 'name',
                    operator: 'EXISTS',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const entityError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Rule option type "nonexistentEntityType" is not defined in codebook',
          ),
        );
        expect(entityError).toBeDefined();
        expect(entityError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'type',
        ]);
      }
    });

    it('rejects filter rule with non-existent attribute', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'nonexistentAttribute',
                    operator: 'EXISTS',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const attributeError = result.error.issues.find((issue) =>
          issue.message.includes(
            '"nonexistentAttribute" is not a valid attribute ID',
          ),
        );
        expect(attributeError).toBeDefined();
        expect(attributeError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'attribute',
        ]);
      }
    });

    it('rejects filter rules with duplicate IDs', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'duplicateId',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'age',
                    operator: 'GREATER_THAN',
                    value: 18,
                  },
                },
                {
                  id: 'duplicateId',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'name',
                    operator: 'EXISTS',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const duplicateError = result.error.issues.find((issue) =>
          issue.message.includes('Rules contain duplicate ID "duplicateId"'),
        );
        expect(duplicateError).toBeDefined();
        expect(duplicateError?.path).toEqual(['stages', 0, 'filter', 'rules']);
      }
    });

    it('validates ego filter rules without entity type in skipLogic', () => {
      // Ego rules are valid in skipLogic/panel/query filters (not in a stage
      // node/edge filter).
      const protocolWithEgoFilter = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            skipLogic: {
              action: 'SHOW',
              filter: {
                rules: [
                  {
                    id: 'egoRule',
                    type: 'ego',
                    options: {
                      attribute: 'egoName',
                      operator: 'EXISTS',
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithEgoFilter),
      );
      expect(result.success).toBe(true);
    });

    it('rejects ego filter rule when ego is not defined in codebook', () => {
      const protocolWithoutEgo = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          ego: undefined,
        },
        stages: [
          {
            ...baseValidProtocol.stages[1],
            skipLogic: {
              action: 'SHOW',
              filter: {
                rules: [
                  {
                    id: 'egoRule',
                    type: 'ego',
                    options: {
                      attribute: 'egoName',
                      operator: 'EXISTS',
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithoutEgo),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const egoError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Entity type "Ego" is not defined in codebook',
          ),
        );
        expect(egoError).toBeDefined();
        expect(egoError?.path).toEqual([
          'stages',
          0,
          'skipLogic',
          'filter',
          'rules',
          0,
          'options',
          'type',
        ]);
      }
    });

    it('validates edge filter rules', () => {
      const protocolWithEdgeFilter = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'edgeRule',
                  type: 'edge',
                  options: {
                    type: 'knows',
                    attribute: 'duration',
                    operator: 'GREATER_THAN',
                    value: 2,
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithEdgeFilter),
      );
      expect(result.success).toBe(true);
    });

    it('validates nested filter rules in skipLogic', () => {
      const protocolWithNestedFilters = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    id: 'skipRule1',
                    type: 'node',
                    options: {
                      type: 'person',
                      attribute: 'age',
                      operator: 'GREATER_THAN',
                      value: 25,
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithNestedFilters),
      );
      expect(result.success).toBe(true);
    });

    it('rejects invalid operator for variable type (CONTAINS on number variable)', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'age',
                    operator: 'CONTAINS',
                    value: '25',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const operatorError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Operator "CONTAINS" is not valid for attribute type "number"',
          ),
        );
        expect(operatorError).toBeDefined();
        expect(operatorError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'operator',
        ]);
      }
    });

    it('rejects GREATER_THAN on text variable', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'name',
                    operator: 'GREATER_THAN',
                    value: 100,
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const operatorError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Operator "GREATER_THAN" is not valid for attribute type "text"',
          ),
        );
        expect(operatorError).toBeDefined();
        expect(operatorError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'operator',
        ]);
      }
    });

    it('accepts valid operator for variable type (GREATER_THAN on number variable)', () => {
      const validProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'age',
                    operator: 'GREATER_THAN',
                    value: 18,
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(withFinishStage(validProtocol));
      expect(result.success).toBe(true);
    });

    it('accepts CONTAINS on text variable', () => {
      const validProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'name',
                    operator: 'CONTAINS',
                    value: 'John',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(withFinishStage(validProtocol));
      expect(result.success).toBe(true);
    });

    it('rejects GREATER_THAN with string value (requires number)', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'age',
                    operator: 'GREATER_THAN',
                    value: '25',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const valueTypeError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Operator "GREATER_THAN" requires a numeric value, but got string',
          ),
        );
        expect(valueTypeError).toBeDefined();
        expect(valueTypeError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'value',
        ]);
      }
    });

    it('rejects CONTAINS with numeric value (requires string)', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'name',
                    operator: 'CONTAINS',
                    value: 123,
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const valueTypeError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Operator "CONTAINS" requires a string value, but got number',
          ),
        );
        expect(valueTypeError).toBeDefined();
        expect(valueTypeError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'value',
        ]);
      }
    });

    it('rejects OPTIONS_GREATER_THAN with string value (requires number count)', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[1],
            filter: {
              rules: [
                {
                  id: 'rule1',
                  type: 'node',
                  options: {
                    type: 'person',
                    attribute: 'category',
                    operator: 'OPTIONS_GREATER_THAN',
                    value: '2',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const valueTypeError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Operator "OPTIONS_GREATER_THAN" requires a numeric value (count), but got string',
          ),
        );
        expect(valueTypeError).toBeDefined();
        expect(valueTypeError?.path).toEqual([
          'stages',
          0,
          'filter',
          'rules',
          0,
          'options',
          'value',
        ]);
      }
    });

    /**
     * A comparison value may be a fraction, because a scalar attribute records
     * a normalised reading and a number attribute may hold any quantity.
     *
     * Whether an operand is one of the options its attribute authored is NOT
     * asked here. Membership is an editor rule, not a load-time error (ruling
     * on issue #1548): protocols already in the field hold rules naming an
     * option that has since been renamed or deleted, and refusing to LOAD one
     * locks the researcher out of the editor that could fix it. The protocol
     * builder refuses a non-member operand as it is authored and reports one
     * it finds in a stored rule; this validator checks shape only.
     */
    const ruleAgainst = (
      attribute: string,
      operator: string,
      value: unknown,
    ) => ({
      ...baseValidProtocol,
      stages: [
        {
          ...baseValidProtocol.stages[1],
          filter: {
            rules: [
              {
                id: 'rule1',
                type: 'node',
                options: { type: 'person', attribute, operator, value },
              },
            ],
          },
        },
      ],
    });

    it('accepts an operand that is one of the ordinal attribute’s options', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(ruleAgainst('strength', 'EXACTLY', 2)),
      );

      expect(result.success).toBe(true);
    });

    it('accepts an INCLUDES operand the attribute no longer offers', () => {
      // The case that rejected a deployed protocol when membership was a
      // load-time error: `category` authors `friend` and `family`, and a
      // stage in the field carries a skip-logic rule naming an option that is
      // no longer among them. Loading it has to succeed so the builder can
      // show the researcher the rule to fix — issue #1548.
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(ruleAgainst('category', 'INCLUDES', 'retired')),
      );

      expect(result.success).toBe(true);
    });

    it('accepts a numeric INCLUDES operand no option of the attribute uses', () => {
      // Verbatim shape of the rule CI refused: a number beside INCLUDES on an
      // attribute whose options are strings.
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(ruleAgainst('category', 'INCLUDES', 7)),
      );

      expect(result.success).toBe(true);
    });

    it('accepts a list of the categorical attribute’s own options', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          ruleAgainst('category', 'INCLUDES', ['friend', 'family']),
        ),
      );

      expect(result.success).toBe(true);
    });

    it('accepts a list holding an option the attribute no longer offers', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          ruleAgainst('category', 'INCLUDES', ['friend', 'retired']),
        ),
      );

      expect(result.success).toBe(true);
    });

    it('accepts a fractional operand against an ordinal attribute', () => {
      // Shape only: the options are whole numbers, and saying so is the
      // editor's job rather than the loader's.
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(ruleAgainst('strength', 'EXACTLY', 0.5)),
      );

      expect(result.success).toBe(true);
    });

    it('keeps a fractional operand valid against a number attribute', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(ruleAgainst('age', 'EXACTLY', 2.5)),
      );

      expect(result.success).toBe(true);
    });

    it('rejects nested filter rules with duplicate IDs', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            ...baseValidProtocol.stages[0],
            skipLogic: {
              action: 'SKIP',
              filter: {
                join: 'AND',
                rules: [
                  {
                    id: 'duplicateNestedId',
                    type: 'node',
                    options: {
                      type: 'person',
                      attribute: 'age',
                      operator: 'GREATER_THAN',
                      value: 25,
                    },
                  },
                  {
                    id: 'duplicateNestedId',
                    type: 'node',
                    options: {
                      type: 'person',
                      attribute: 'name',
                      operator: 'EXISTS',
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const duplicateNestedError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Rules contain duplicate ID "duplicateNestedId"',
          ),
        );
        expect(duplicateNestedError).toBeDefined();
        expect(duplicateNestedError?.path).toEqual([
          'stages',
          0,
          'skipLogic',
          'filter',
          'rules',
        ]);
      }
    });
  });

  describe('Variable Cross-Reference Validation', () => {
    it('validates sameAs cross-reference for node variables', () => {
      const protocolWithCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                confirmAge: {
                  name: 'ConfirmAge',
                  label: 'ConfirmAge',
                  type: 'number',
                  validation: {
                    sameAs: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('rejects sameAs cross-reference to non-existent variable', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                confirmAge: {
                  name: 'ConfirmAge',
                  label: 'ConfirmAge',
                  type: 'number',
                  validation: {
                    sameAs: 'nonexistentVariable',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const crossRefError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(crossRefError).toBeDefined();
        expect(crossRefError?.path).toEqual([
          'codebook',
          'node',
          'person',
          'variables',
          'confirmAge',
          'validation',
          'sameAs',
        ]);
      }
    });

    it('validates differentFrom cross-reference for node variables', () => {
      const protocolWithCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                uniqueId: {
                  name: 'UniqueID',
                  label: 'UniqueID',
                  type: 'text',
                  validation: {
                    differentFrom: 'name',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('rejects differentFrom cross-reference to non-existent variable', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                uniqueId: {
                  name: 'UniqueID',
                  label: 'UniqueID',
                  type: 'text',
                  validation: {
                    differentFrom: 'nonexistentVariable',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const crossRefError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(crossRefError).toBeDefined();
        expect(crossRefError?.path).toEqual([
          'codebook',
          'node',
          'person',
          'variables',
          'uniqueId',
          'validation',
          'differentFrom',
        ]);
      }
    });

    it('validates greaterThanVariable cross-reference for node variables', () => {
      const protocolWithCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                maxAge: {
                  name: 'MaximumAge',
                  label: 'MaximumAge',
                  type: 'number',
                  validation: {
                    greaterThanVariable: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('validates lessThanVariable cross-reference for node variables', () => {
      const protocolWithCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                minAge: {
                  name: 'MinimumAge',
                  label: 'MinimumAge',
                  type: 'number',
                  validation: {
                    lessThanVariable: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('validates greaterThanOrEqualToVariable cross-reference for node variables', () => {
      const protocolWithCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                minAge: {
                  name: 'MinimumAge',
                  label: 'MinimumAge',
                  type: 'number',
                  validation: {
                    greaterThanOrEqualToVariable: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('rejects greaterThanOrEqualToVariable cross-reference to non-existent variable', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                minAge: {
                  name: 'MinimumAge',
                  label: 'MinimumAge',
                  type: 'number',
                  validation: {
                    greaterThanOrEqualToVariable: 'nonexistentVariable',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const crossRefError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(crossRefError).toBeDefined();
        expect(crossRefError?.path).toEqual([
          'codebook',
          'node',
          'person',
          'variables',
          'minAge',
          'validation',
          'greaterThanOrEqualToVariable',
        ]);
      }
    });

    it('validates lessThanOrEqualToVariable cross-reference for node variables', () => {
      const protocolWithCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                maxAge: {
                  name: 'MaximumAge',
                  label: 'MaximumAge',
                  type: 'number',
                  validation: {
                    lessThanOrEqualToVariable: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('rejects lessThanOrEqualToVariable cross-reference to non-existent variable', () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                maxAge: {
                  name: 'MaximumAge',
                  label: 'MaximumAge',
                  type: 'number',
                  validation: {
                    lessThanOrEqualToVariable: 'nonexistentVariable',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const crossRefError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentVariable" does not exist in the codebook',
          ),
        );
        expect(crossRefError).toBeDefined();
        expect(crossRefError?.path).toEqual([
          'codebook',
          'node',
          'person',
          'variables',
          'maxAge',
          'validation',
          'lessThanOrEqualToVariable',
        ]);
      }
    });

    it('validates cross-references for ego variables', () => {
      const protocolWithEgoCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          ego: {
            variables: {
              ...baseValidProtocol.codebook.ego.variables,
              confirmName: {
                name: 'ConfirmName',
                label: 'ConfirmName',
                type: 'text',
                validation: {
                  sameAs: 'egoName',
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithEgoCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it('validates cross-references for edge variables', () => {
      const protocolWithEdgeCrossRef = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          edge: {
            knows: {
              ...baseValidProtocol.codebook.edge.knows,
              variables: {
                ...baseValidProtocol.codebook.edge.knows.variables,
                maxDuration: {
                  name: 'MaximumDuration',
                  label: 'MaximumDuration',
                  type: 'number',
                  validation: {
                    greaterThanVariable: 'duration',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithEdgeCrossRef),
      );
      expect(result.success).toBe(true);
    });

    it("rejects cross-reference validation when referenced variable doesn't exist in ego", () => {
      const invalidProtocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          ego: {
            variables: {
              ...baseValidProtocol.codebook.ego.variables,
              invalidRef: {
                name: 'InvalidReference',
                label: 'InvalidReference',
                type: 'text',
                validation: {
                  sameAs: 'nonexistentEgoVar',
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(invalidProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const crossRefError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "nonexistentEgoVar" does not exist in the codebook',
          ),
        );
        expect(crossRefError).toBeDefined();
        expect(crossRefError?.path).toEqual([
          'codebook',
          'ego',
          'variables',
          'invalidRef',
          'validation',
          'sameAs',
        ]);
      }
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('handles empty stages array', () => {
      const protocolWithNoStages = {
        ...baseValidProtocol,
        stages: [],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithNoStages),
      );
      expect(result.success).toBe(true);
    });

    it('handles protocol with minimal codebook', () => {
      const minimalProtocol = {
        name: 'Minimal Protocol',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook: {},
        stages: [],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(minimalProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('handles stages without form fields', () => {
      const protocolWithoutForm = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'informationStage',
            type: 'Information',
            label: localized('Information Stage'),
            title: localized('Information Stage'),
            items: [
              {
                id: 'item1',
                type: 'text',
                content: localized('This is information'),
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithoutForm),
      );
      expect(result.success).toBe(true);
    });

    it('handles stages without prompts', () => {
      const protocolWithoutPrompts = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'simpleStage',
            type: 'Information',
            label: localized('Simple Stage'),
            title: localized('Simple Stage'),
            items: [
              {
                id: 'item1',
                type: 'text',
                content: localized('Just some content'),
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithoutPrompts),
      );
      expect(result.success).toBe(true);
    });

    it('handles complex nested validation scenarios', () => {
      const complexProtocol = {
        ...protocolWithFlagVariables,
        stages: [
          {
            id: 'complex1',
            type: 'NameGenerator',
            label: localized('Complex Stage'),
            subject: {
              entity: 'node',
              type: 'person',
            },
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'name',
                  prompt: localized('Enter name'),
                },
              ],
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Main prompt'),
                additionalAttributes: [
                  { variable: 'closeFriend', value: true },
                  { variable: 'coworker', value: false },
                ],
              },
            ],
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    id: 'skipRule1',
                    type: 'ego',
                    options: {
                      attribute: 'egoAge',
                      operator: 'LESS_THAN',
                      value: 21,
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(complexProtocol),
      );
      expect(result.success).toBe(true);
    });

    it('handles multiple validation errors simultaneously', () => {
      const multiErrorProtocol = {
        ...baseValidProtocol,
        stages: [
          {
            id: 'errorStage',
            type: 'NameGenerator',
            label: localized('Error Stage'),
            subject: {
              entity: 'node',
              type: 'nonexistentNodeType', // Error 1: Invalid subject
            },
            form: {
              title: localized('Add person'),
              fields: [
                {
                  variable: 'nonexistentVariable', // Error 2: Invalid form field variable
                  prompt: localized('Enter something'),
                },
              ],
            },
            prompts: [
              {
                id: 'prompt1',
                text: localized('Main prompt'),
                additionalAttributes: [
                  { variable: 'anotherNonexistent', value: true }, // Error 3: Invalid additional attribute
                ],
              },
            ],
          },
        ],
      };

      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(multiErrorProtocol),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should have multiple errors
        expect(result.error.issues.length).toBeGreaterThan(1);

        // Check for different types of errors
        const subjectError = result.error.issues.find((issue) =>
          issue.message.includes(
            'Stage subject is not defined in the codebook',
          ),
        );
        const formFieldError = result.error.issues.find((issue) =>
          issue.message.includes('does not exist in the codebook'),
        );
        const attributeError = result.error.issues.find((issue) =>
          issue.message.includes('does not exist in the codebook'),
        );

        expect(subjectError).toBeDefined();
        expect(formFieldError).toBeDefined();
        expect(attributeError).toBeDefined();
      }
    });
  });

  describe('Geospatial Stage MapOptions Validation', () => {
    const createGeospatialProtocol = (mapOptionsOverrides = {}) => ({
      ...baseValidProtocol,
      codebook: {
        ...baseValidProtocol.codebook,
        node: {
          ...baseValidProtocol.codebook.node,
          person: {
            ...baseValidProtocol.codebook.node.person,
            variables: {
              ...baseValidProtocol.codebook.node.person.variables,
              homeLocation: {
                name: 'Home_Location',
                label: 'Home_Location',
                type: 'location',
              },
            },
          },
        },
      },
      assetManifest: {
        'asset-token-123': {
          id: 'asset-token-123',
          type: 'apikey',
          name: 'Mapbox Token',
          value: 'pk.example',
        },
        'asset-geojson-456': {
          id: 'asset-geojson-456',
          type: 'geojson',
          name: 'map.geojson',
          source: 'map.geojson',
        },
      },
      stages: [
        {
          id: 'geospatial1',
          type: 'Geospatial',
          label: localized('Geospatial Stage'),
          subject: {
            entity: 'node',
            type: 'person',
          },
          mapOptions: {
            tokenAssetId: 'asset-token-123',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-73.935242, 40.73061],
            initialZoom: 10,
            dataSourceAssetId: 'asset-geojson-456',
            color: 'ord-color-seq-1',
            targetFeatureProperty: 'name',
            ...mapOptionsOverrides,
          },
          prompts: [
            {
              id: 'geoPrompt1',
              text: localized('Select your location'),
              variable: 'homeLocation',
            },
          ],
        },
      ],
    });

    it('validates Geospatial stage with showTransit and allowSearch omitted', () => {
      const protocol = createGeospatialProtocol();
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('validates Geospatial stage with showTransit set to true', () => {
      const protocol = createGeospatialProtocol({ showTransit: true });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('validates Geospatial stage with showTransit set to false', () => {
      const protocol = createGeospatialProtocol({ showTransit: false });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('validates Geospatial stage with allowSearch set to true', () => {
      const protocol = createGeospatialProtocol({ allowSearch: true });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('validates Geospatial stage with allowSearch set to false', () => {
      const protocol = createGeospatialProtocol({ allowSearch: false });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('validates Geospatial stage with both showTransit and allowSearch set', () => {
      const protocol = createGeospatialProtocol({
        showTransit: true,
        allowSearch: true,
      });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it.each([
      'node-color-seq-1',
      'edge-color-seq-1',
      'ord-color-seq-10',
      'cat-color-seq-10',
    ])('accepts Geospatial stage color reference %s', (color) => {
      const protocol = createGeospatialProtocol({ color });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it.each(['', '#3399ff', 'primary-color-seq-1', 'ord-color-seq-11'])(
      'rejects Geospatial stage color %j',
      (color) => {
        const protocol = createGeospatialProtocol({ color });
        const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
        expect(result.success).toBe(false);
      },
    );

    it('rejects an empty Geospatial color by naming every palette it could name', () => {
      // The empty string is the interesting one: it is what an Architect field
      // holds before anything is picked, so it reaches the schema looking like
      // a value rather than an omission. `ColorReferenceSchema` is a union of
      // the four palettes, and a union's own message is only "Invalid input" —
      // what makes the failure actionable is the branch messages underneath,
      // which spell out every colour the field will accept.
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(createGeospatialProtocol({ color: '' })),
      );
      expect(result.success).toBe(false);
      const issue = (result.success ? [] : result.error.issues).find(
        (candidate) => candidate.path.join('.') === 'stages.0.mapOptions.color',
      );
      const quoted = (palette: readonly string[]) =>
        `Invalid option: expected one of ${palette
          .map((value) => `"${value}"`)
          .join('|')}`;
      expect(
        issue?.code === 'invalid_union' &&
          issue.errors.flat().map((nested) => nested.message),
      ).toEqual([
        quoted(NodeColorSequence),
        quoted(EdgeColorSequence),
        quoted(OrdinalColorSequence),
        quoted(CategoricalColorSequence),
      ]);
    });

    it('rejects Geospatial stage with invalid showTransit type', () => {
      const protocol = createGeospatialProtocol({ showTransit: 'yes' });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(false);
    });

    it('rejects Geospatial stage with invalid allowSearch type', () => {
      const protocol = createGeospatialProtocol({ allowSearch: 1 });
      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(false);
    });
  });

  describe('Regression: greaterThanOrEqualToVariable cross-reference (PR #686)', () => {
    it('validates clean when the referenced variable exists only via greaterThanOrEqualToVariable', () => {
      const protocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                ...baseValidProtocol.codebook.node.person.variables,
                minAge: {
                  name: 'MinimumAge',
                  label: 'MinimumAge',
                  type: 'number',
                  validation: {
                    greaterThanOrEqualToVariable: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(true);
    });

    it('emits the existence error when the variable referenced by greaterThanOrEqualToVariable is removed', () => {
      const protocol = {
        ...baseValidProtocol,
        codebook: {
          ...baseValidProtocol.codebook,
          node: {
            person: {
              ...baseValidProtocol.codebook.node.person,
              variables: {
                // 'age' removed — only 'name', 'category', 'strength' remain
                name: baseValidProtocol.codebook.node.person.variables.name,
                category:
                  baseValidProtocol.codebook.node.person.variables.category,
                strength:
                  baseValidProtocol.codebook.node.person.variables.strength,
                minAge: {
                  name: 'MinimumAge',
                  label: 'MinimumAge',
                  type: 'number',
                  validation: {
                    greaterThanOrEqualToVariable: 'age',
                  },
                },
              },
            },
          },
        },
      };

      const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
      expect(result.success).toBe(false);
      if (!result.success) {
        const refError = result.error.issues.find((issue) =>
          issue.message.includes(
            'The attribute "age" does not exist in the codebook',
          ),
        );
        expect(refError).toBeDefined();
        expect(refError?.path).toEqual([
          'codebook',
          'node',
          'person',
          'variables',
          'minAge',
          'validation',
          'greaterThanOrEqualToVariable',
        ]);
      }
    });
  });

  describe('FamilyPedigree locked value-set validation', () => {
    type Options = { value: string; label: Record<string, string> }[];

    // Builds a protocol whose codebook carries the FamilyPedigree person and
    // relationship types, with the gender-identity, sex-assigned-at-birth and
    // relationship-kind variables present as categorical variables carrying the
    // supplied option sets. Gender identity is the researcher's: its options
    // and the words each takes are whatever is supplied.
    const protocolWithLockedVariables = ({
      genderIdentityOptions = GENDER_IDENTITY_OPTIONS,
      genderIdentityTerms = GENDER_IDENTITY_TERMS,
      askGenderIdentity = true,
      sexAssignedAtBirthType = 'categorical',
      sexAssignedAtBirthOptions = localizedOptions(
        PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
      ),
      relationshipKindOptions = localizedOptions(
        PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
      ),
    }: {
      genderIdentityOptions?: Options;
      genderIdentityTerms?: { value: string | number; words: string }[];
      askGenderIdentity?: boolean;
      sexAssignedAtBirthType?: 'categorical' | 'ordinal';
      sexAssignedAtBirthOptions?: Options;
      relationshipKindOptions?: Options;
    }) => ({
      name: 'Test Protocol',
      schemaVersion: 9 as const,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          person: {
            name: 'Person',
            label: localized('Person'),
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              isEgo: { name: 'IsEgo', label: 'IsEgo', type: 'boolean' },
              name: { name: 'Name', label: 'Name', type: 'text' },
              gender: {
                name: 'Gender',
                label: 'Gender',
                type: 'categorical',
                options: genderIdentityOptions,
              },
              sab: {
                name: 'Sab',
                label: 'Sab',
                type: sexAssignedAtBirthType,
                readOnly: true,
                options: sexAssignedAtBirthOptions,
              },
            },
          },
        },
        edge: {
          family: {
            name: 'Family',
            label: localized('Family'),
            color: 'edge-color-seq-1',
            variables: {
              kind: {
                name: 'Kind',
                label: 'Kind',
                type: 'categorical',
                readOnly: true,
                options: relationshipKindOptions,
              },
              carrier: { name: 'Carrier', label: 'Carrier', type: 'boolean' },
              current: { name: 'Current', label: 'Current', type: 'boolean' },
            },
          },
        },
      },
      stages: [
        {
          id: 'fp1',
          type: 'FamilyPedigree' as const,
          label: localized('Family Pedigree'),
          subject: { entity: 'node' as const, type: 'person' },
          prompt: localized('Build your family'),
          nodeConfiguration: {
            nameAttribute: 'name',
            ...(askGenderIdentity
              ? {
                  genderIdentity: {
                    attribute: 'gender',
                    terms: genderIdentityTerms,
                  },
                }
              : {}),
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
    });

    it('accepts locked variables carrying their canonical option sets', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(protocolWithLockedVariables({})),
      );
      expect(result.success).toBe(true);
      const lockedIssue =
        !result.success &&
        result.error.issues.find((i) =>
          i.message.includes('must keep its fixed options'),
        );
      expect(lockedIssue).toBeFalsy();
    });

    it('lets the researcher define their own gender identity options', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            genderIdentityOptions: [
              { value: 'transWoman', label: localized('Trans woman') },
              { value: 'woman', label: localized('Woman') },
            ],
            genderIdentityTerms: [
              { value: 'transWoman', words: 'feminine' },
              { value: 'woman', words: 'feminine' },
            ],
          }),
        ),
      );
      expect(result.success).toBe(true);
    });

    it('treats options with no words as neutral, so an empty mapping is valid', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({ genderIdentityTerms: [] }),
        ),
      );
      expect(result.success).toBe(true);
    });

    it('accepts words for a value the attribute no longer has', () => {
      // The attribute's options are edited in the codebook before the stage
      // that owns their words is saved, so a stale entry is not an error; the
      // interview ignores it.
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            genderIdentityOptions: [
              { value: 'woman', label: localized('Woman') },
              { value: 'man', label: localized('Man') },
            ],
            genderIdentityTerms: [
              { value: 'woman', words: 'feminine' },
              { value: 'agender', words: 'neutral' },
            ],
          }),
        ),
      );
      expect(result.success).toBe(true);
    });

    it('accepts a stage that does not ask about gender identity', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({ askGenderIdentity: false }),
        ),
      );
      expect(result.success).toBe(true);
    });

    it('rejects words given twice for one option', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            genderIdentityTerms: [
              { value: 'woman', words: 'feminine' },
              { value: 'woman', words: 'neutral' },
            ],
          }),
        ),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.includes(
            'gender identity words are given more than once for "woman"',
          ),
        );
        expect(issue).toBeDefined();
        expect(issue?.path).toEqual([
          'stages',
          0,
          'nodeConfiguration',
          'genderIdentity',
          'terms',
          1,
          'value',
        ]);
      }
    });

    it('accepts locked variables whose option labels are reworded or translated', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage({
          ...protocolWithLockedVariables({
            sexAssignedAtBirthOptions:
              PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS.map(({ value }) => ({
                value,
                label: { en: `Sex: ${value}`, fr: `Sexe : ${value}` },
              })),
          }),
          localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
        }),
      );
      expect(result.success ? null : result.error.issues).toBeNull();
    });

    it('rejects a kind of words that does not exist', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            genderIdentityTerms: [{ value: 'woman', words: 'female' }],
          }),
        ),
      );
      expect(result.success).toBe(false);
    });

    it('rejects a sex-assigned-at-birth variable whose options were edited', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            sexAssignedAtBirthOptions: [
              { value: 'female', label: localized('Female') },
              { value: 'male', label: localized('Male') },
            ],
          }),
        ),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) =>
            i.message.includes(
              'The sex assigned at birth attribute "Sab" used by a Family Pedigree stage',
            ) && i.message.includes('must keep its fixed options'),
        );
        expect(issue).toBeDefined();
        expect(issue?.path).toEqual([
          'stages',
          0,
          'nodeConfiguration',
          'sexAssignedAtBirthAttribute',
        ]);
      }
    });

    it('rejects a relationship-kind variable whose options were edited', () => {
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            relationshipKindOptions: [
              { value: 'biological', label: localized('Biological parent') },
              { value: 'made-up', label: localized('Made Up') },
            ],
          }),
        ),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) =>
            i.message.includes(
              'The family relationship kind attribute "Kind" used by a Family Pedigree stage',
            ) && i.message.includes('must keep its fixed options'),
        );
        expect(issue).toBeDefined();
        expect(issue?.path).toEqual([
          'stages',
          0,
          'edgeConfiguration',
          'kindAttribute',
        ]);
      }
    });

    it('rejects an ordinal locked variable whose options were edited', () => {
      // Architect treats readOnly ordinal variables as locked exactly like
      // categorical ones (getLockedOptions), and ordinal carries the identical
      // options schema. The locked-set backstop must fire for ordinal too.
      const result = ProtocolSchemaV9.safeParse(
        withFinishStage(
          protocolWithLockedVariables({
            sexAssignedAtBirthType: 'ordinal',
            sexAssignedAtBirthOptions: [
              { value: 'yes', label: localized('Yes') },
              { value: 'no', label: localized('No') },
            ],
          }),
        ),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) =>
            i.message.includes(
              'The sex assigned at birth attribute "Sab" used by a Family Pedigree stage',
            ) && i.message.includes('must keep its fixed options'),
        );
        expect(issue).toBeDefined();
      }
    });
  });
});
