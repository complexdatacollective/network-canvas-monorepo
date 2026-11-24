import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

export const anonymisationStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('Anonymisation'),
    // What the participant reads before choosing a passphrase. A heading is
    // part of the text, written as one, rather than a field of its own.
    explanationText: localizedString(
      nonBlankText(),
      { format: 'markdown', lines: 'multiple' },
      {
        dynamicValues: 'stageText',
      },
    ),
    validation: z
      .strictObject({
        minLength: z.number().int().optional(),
        maxLength: z.number().int().optional(),
      })
      .optional(),
  }),
);
