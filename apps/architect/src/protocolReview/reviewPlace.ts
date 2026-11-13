import { codebookHref } from '~/components/Codebook/codebookLinks';

import type { FixPlace } from './describeFix';

/**
 * A screen the review is opened from, other than the Stages screen: one
 * stage's editor or the Codebook page. There, the review starts on the
 * problems the researcher chose to fix themselves on that screen.
 */
export type ReviewPlace =
  | { kind: 'stage'; stageId: string }
  | { kind: 'codebook' };

const STAGE_PATH = /^\/protocol\/stage\/([^/?#]+)$/u;

/** The place a route is, or null for any route that is not one. */
export const reviewPlaceAt = (location: string): ReviewPlace | null => {
  if (location === codebookHref()) return { kind: 'codebook' };
  const stage = STAGE_PATH.exec(location)?.[1];
  if (stage === undefined || stage === 'new') return null;
  return { kind: 'stage', stageId: decodeURIComponent(stage) };
};

/** Whether a fix made at `fixPlace` is made at `place`. */
export const isFixedAt = (place: ReviewPlace, fixPlace: FixPlace) =>
  place.kind === 'stage'
    ? fixPlace.kind === 'stage' && fixPlace.stageId === place.stageId
    : fixPlace.kind === 'codebook';
