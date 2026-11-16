import { z } from 'zod';

import {
  EVERY_VERSION,
  type MessageArguments,
} from '../../../localization/messageArguments.ts';
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
import { SUBJECT_ARGUMENTS } from '../stage-wording/subject.ts';
import { baseStageSchema } from './base.ts';
import {
  MAX_NODES_ARGUMENTS,
  MIN_NODES_ARGUMENTS,
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
 * What the label of an item with no name may use: the number that tells it
 * from other unnamed items, which it must show, and the name of the stage's
 * node type.
 */
export const UNNAMED_LABEL_ARGUMENTS: MessageArguments = {
  count: { kind: 'text', required: EVERY_VERSION },
  ...SUBJECT_ARGUMENTS,
};

/**
 * The roster's own words (`stage-wording/name-generator-roster.ts`). The
 * roster always loads its data, so it always shows its all-added notice and
 * the label of an unnamed item; it shows a limit notice only while the limit
 * is on. A stage that omits one shows Network Canvas's wording.
 */
const rosterWording = {
  minNodesNotice: localizedMessage(nonBlankText(), {
    arguments: MIN_NODES_ARGUMENTS,
  }).optional(),
  maxNodesNotice: localizedMessage(nonBlankText(), {
    arguments: MAX_NODES_ARGUMENTS,
  }).optional(),
  allAddedNotice: localizedMessage(nonBlankText(), {
    arguments: SUBJECT_ARGUMENTS,
  }).optional(),
  unnamedLabel: localizedMessage(nonBlankText(), {
    arguments: UNNAMED_LABEL_ARGUMENTS,
  }).optional(),
};

export const nameGeneratorRosterStage = baseStageSchema.extend({
  type: z.literal('NameGeneratorRoster'),
  subject: NodeStageSubjectSchema,
  dataSource: assetReference(),
  // The heading above the people the participant can add. The roster IS the
  // panel, so it is named for what it heads rather than as the stage's title.
  panelTitle: localizedString(
    nonBlankText(),
    { format: 'plain', lines: 'single' },
    {
      dynamicValues: 'stageText',
    },
  ).optional(),
  cardOptions: z
    .strictObject({
      additionalProperties: z
        .array(
          z.strictObject({
            label: localizedString(nonBlankText(), {
              format: 'plain',
              lines: 'single',
            }),
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
            label: localizedString(nonBlankText(), {
              format: 'plain',
              lines: 'single',
            }),
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
});
