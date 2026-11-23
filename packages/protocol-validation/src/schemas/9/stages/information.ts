import { z } from 'zod';

import { localizedString, nonBlankText } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

/**
 * A page the participant reads: one piece of text holding everything the
 * page shows, in the order it shows it. Its heading is a heading in the text,
 * and each image, audio recording or video is a block among its paragraphs
 * that names a file of the protocol (see `AssetBlock`).
 *
 * One text rather than a heading and a list of items, so the page is written,
 * read and translated as the single document a participant sees.
 */
export const informationStage = baseStageSchema.extend({
  type: z.literal('Information'),
  content: localizedString(
    nonBlankText(),
    { format: 'markdown', lines: 'multiple', assetBlocks: true },
    { dynamicValues: 'stageText' },
  ),
});
