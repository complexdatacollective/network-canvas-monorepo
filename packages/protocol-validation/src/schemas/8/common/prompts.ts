import { faker } from '@faker-js/faker';

import { getEdgeTypeId, getNodeVariableId } from '~/utils/mock-seeds';
import { z } from '~/utils/zod-mock-extension';

import {
  asEntityAttributeReference,
  entityAttributeReference,
} from '../entity-attribute-reference';
import { SortOrderSchema } from '../filters';

export const promptSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
});

export type BasePrompt = z.infer<typeof promptSchema>;

const AdditionalAttributesSchema = z.array(
  z.strictObject({
    variable: entityAttributeReference({ subject: 'stageSubject' }),
    value: z.boolean(),
  }),
);

export type AdditionalAttributes = z.infer<typeof AdditionalAttributesSchema>;

export const nameGeneratorPromptSchema = promptSchema.extend({
  additionalAttributes: AdditionalAttributesSchema.optional(),
});

export const sociogramPromptSchema = promptSchema.extend({
  sortOrder: SortOrderSchema.optional(),
  layout: z.strictObject({
    layoutVariable: entityAttributeReference({
      subject: 'stageSubject',
    }).generateMock(() => asEntityAttributeReference(getNodeVariableId())),
  }),
  edges: z
    .strictObject({
      display: z.array(z.string()).optional(),
      create: z.string().optional(),
    })
    .optional(),
  highlight: z
    .strictObject({
      allowHighlighting: z.boolean().optional(),
      variable: entityAttributeReference({
        subject: 'stageSubject',
      }).optional(),
    })
    .optional(),
});

export const dyadCensusPromptSchema = promptSchema.extend({
  createEdge: z.string().generateMock(() => getEdgeTypeId()),
});

export const tieStrengthCensusPromptSchema = promptSchema.extend({
  createEdge: z.string().generateMock(() => getEdgeTypeId()),
  edgeVariable: entityAttributeReference({
    subject: { sibling: 'createEdge', entity: 'edge' },
    requireType: ['ordinal'],
  }).generateMock(() => asEntityAttributeReference(getNodeVariableId())),
  negativeLabel: z
    .string()
    .generateMock(() =>
      faker.helpers.arrayElement([
        'not_knows',
        'not_works_with',
        'not_friends_with',
        'not_related_to',
      ]),
    ),
});

export const ordinalBinPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }).generateMock(
    () => asEntityAttributeReference(getNodeVariableId()),
  ),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
  color: z.string().optional(),
});

export const categoricalBinPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }).generateMock(
    () => asEntityAttributeReference(getNodeVariableId()),
  ),
  // TODO: This should be structured this way:
  // otherOption: z.strictObject({
  // 	binLabel: z.string(),
  // 	variable: z.string(),
  // 	prompt: z.string(),
  // }).optional(),
  otherVariable: entityAttributeReference({ subject: 'stageSubject' })
    .generateMock(() => asEntityAttributeReference(getNodeVariableId()))
    .optional(),
  otherVariablePrompt: z.string().optional(),
  otherOptionLabel: z.string().optional(),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
});

export const oneToManyDyadCensusPromptSchema = promptSchema.extend({
  createEdge: z.string().generateMock(() => getEdgeTypeId()),
  bucketSortOrder: SortOrderSchema.optional(),
  binSortOrder: SortOrderSchema.optional(),
});

export const geospatialPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }).generateMock(
    () => asEntityAttributeReference(getNodeVariableId()),
  ),
});

export const familyPedigreeNominationPromptSchema = promptSchema.extend({
  variable: entityAttributeReference({ subject: 'stageSubject' }).generateMock(
    () => asEntityAttributeReference(getNodeVariableId()),
  ),
});
