import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { assetReference } from '../asset-reference.ts';
import {
  NodeStageSubjectSchema,
  nameGeneratorPromptSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { SortOrderSchema } from '../filters/index.ts';
import {
  localizedMessage,
  localizedString,
  nonBlankText,
} from '../localized-string.ts';
import {
  hasMaximumNodes,
  hasMinimumNodes,
  hasRosterSearch,
  requireWhenShown,
  type StageRecord,
} from '../stage-wording/conditions.ts';
import { baseStageSchema } from './base.ts';
import {
  NODE_COUNT_ARGUMENTS,
  nameGeneratorBehavioursSchema,
} from './name-generator.ts';

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

/**
 * The roster's own words (`stage-wording/name-generator-roster.ts`). The
 * roster always loads its data, so its loading error and its all-added notice
 * are always required; its limit notices and search wording are required only
 * while the limit or the search is on.
 */
const rosterWording = {
  minNodesNotice: localizedMessage(nonBlankText(), {
    arguments: NODE_COUNT_ARGUMENTS,
  }).optional(),
  maxNodesNotice: localizedString(nonBlankText(), 'plain').optional(),
  externalDataError: localizedString(nonBlankText(), 'plain'),
  allAddedNotice: localizedString(nonBlankText(), 'plain'),
  searchLabel: localizedString(nonBlankText(), 'plain').optional(),
  searchNoMatch: localizedString(nonBlankText(), 'plain').optional(),
};

const requireRosterWording = (stage: StageRecord, ctx: z.RefinementCtx) =>
  requireWhenShown(stage, ctx, [
    {
      name: 'minNodesNotice',
      when: hasMinimumNodes,
      message: 'A stage with a minimum needs a minimum notice.',
    },
    {
      name: 'maxNodesNotice',
      when: hasMaximumNodes,
      message: 'A stage with a maximum needs a maximum notice.',
    },
    {
      name: 'searchLabel',
      when: hasRosterSearch,
      message: 'A roster with a search needs a search label.',
    },
    {
      name: 'searchNoMatch',
      when: hasRosterSearch,
      message: 'A roster with a search needs a no-match notice.',
    },
  ]);

export const nameGeneratorRosterStage = baseStageSchema
  .extend({
    type: z.literal('NameGeneratorRoster'),
    subject: NodeStageSubjectSchema,
    dataSource: assetReference(),
    // The heading above the people the participant can add. The roster IS the
    // panel, so it is named for what it heads rather than as the stage's title.
    panelTitle: localizedString(nonBlankText(), 'plain'),
    cardOptions: z
      .strictObject({
        additionalProperties: z
          .array(
            z.strictObject({
              label: localizedString(nonBlankText(), 'plain'),
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
              label: localizedString(nonBlankText(), 'plain'),
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
    ...rosterWording,
  })
  .superRefine(requireRosterWording);
