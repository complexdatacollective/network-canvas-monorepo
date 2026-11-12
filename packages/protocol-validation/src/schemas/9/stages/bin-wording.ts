import { localizedMessage, nonBlankText } from '../localized-string.ts';
import { SUBJECT_ARGUMENTS } from '../stage-wording/subject.ts';

/**
 * The words a bin stage shows about its completion gate, which Network Canvas
 * supplies (`stage-wording/bins.ts`). Shown only while the gate is on; a
 * stage that omits it shows Network Canvas's wording. It may name the stage's
 * node type.
 */
export const binWording = {
  unplacedNodesNotice: localizedMessage(nonBlankText(), {
    arguments: SUBJECT_ARGUMENTS,
  }).optional(),
};
