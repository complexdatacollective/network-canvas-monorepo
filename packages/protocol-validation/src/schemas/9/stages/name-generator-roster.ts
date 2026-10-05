import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { assetReference } from '../asset-reference.ts';
import {
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { SortOrderSchema } from '../filters/index.ts';
import { baseStageSchema } from './base.ts';
import { nameGeneratorBehavioursSchema } from './name-generator.ts';

/**
 * A roster column name. The roster is an external data source, so this is NOT
 * guaranteed to be a codebook variable — but in a Network Canvas-format roster
 * it usually is one: the shipped development protocol's roster keys its node
 * attributes by the venue type's own variable ids, and one of those variables
 * (`Abbreviated_Name`) is referenced nowhere else in the protocol.
 *
 * Tagging it as an existence-unchecked reference is what keeps the Codebook
 * from offering to delete a variable the roster still reads (#1392); leaving it
 * an untagged `z.string()` is what made that variable read "not in use".
 *
 * The converse is a deliberate, safe approximation: a CSV roster whose column
 * name happens to spell a codebook variable's id marks that variable "in use"
 * and names this stage under "Used In". Erring towards undeletable is the right
 * side to be wrong on, and the roster does read a column of that name.
 */
const rosterColumnReference = () =>
  entityAttributeReference({
    subject: 'stageSubject',
    existence: 'unchecked',
  });

export const nameGeneratorRosterStage = baseStageSchema.extend({
  type: z.literal('NameGeneratorRoster'),
  subject: NodeStageSubjectSchema,
  dataSource: assetReference(),
  cardOptions: z
    .strictObject({
      additionalProperties: z
        .array(
          z.strictObject({
            label: z.string(),
            variable: rosterColumnReference(),
          }),
        )
        .optional(),
    })
    .optional(),
  sortOptions: z
    .strictObject({
      sortOrder: SortOrderSchema.optional(),
      sortableProperties: z
        .array(
          z.strictObject({
            label: z.string(),
            variable: rosterColumnReference(),
          }),
        )
        .optional(),
    })
    .optional(),
  searchOptions: z
    .strictObject({
      fuzziness: z.number(),
      matchProperties: z.array(rosterColumnReference()).min(1),
    })
    .optional(),
  prompts: z
    .array(nameGeneratorPromptSchema)
    .min(1)
    .superRefine((prompts, ctx) => {
      // Check for duplicate prompt IDs
      const duplicatePromptId = findDuplicateId(prompts);
      if (duplicatePromptId) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Prompts contain duplicate ID "${duplicatePromptId}"`,
          path: [],
        });
      }
    }),
  behaviours: nameGeneratorBehavioursSchema,
});
