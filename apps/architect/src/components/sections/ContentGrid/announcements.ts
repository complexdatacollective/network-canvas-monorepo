import type { ContentSlotType } from './itemTypes';

/**
 * What the item editor's `aria-live` region says when the researcher chooses
 * or changes an item's content type.
 *
 * Choosing a type mounts a whole new required control, and changing one
 * replaces the control outright — a rich text editor becomes a resource
 * picker, or the other way round. A sighted researcher sees both happen;
 * without an announcement they are silent, and silence about a change that
 * used to destroy work is the worst possible reading of it.
 *
 * So each case says what actually became of the content, and only what is
 * true of it: nothing is described as kept unless something was entered to
 * keep. Each variant is a whole sentence chosen by branch rather than
 * assembled from fragments, so it can be localised as a unit.
 */

/**
 * What happened to the content across a change of type.
 *
 * - `restored` — the type being switched TO already has content, and it is
 *   back on screen.
 * - `kept` — the type being switched FROM had content, which is being held
 *   for it.
 * - `empty` — neither type has any content yet.
 */
export type ContentDraftOutcome = 'restored' | 'kept' | 'empty';

// The researcher-facing name of each type, matching the type control's own
// options (a test pins them together, so the two cannot drift).
const TYPE_LABELS: Record<ContentSlotType, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
};

export const getContentTypeChosenAnnouncement = (
  type: ContentSlotType,
): string =>
  `Content type set to ${TYPE_LABELS[type]}. A content field for it has been added below.`;

export const getContentTypeChangedAnnouncement = (
  type: ContentSlotType,
  outcome: ContentDraftOutcome,
): string => {
  const label = TYPE_LABELS[type];

  if (outcome === 'restored') {
    return `Content type changed to ${label}. The content you entered for ${label} earlier has been restored.`;
  }

  if (outcome === 'kept') {
    return `Content type changed to ${label}. The content you entered for the previous type is kept, and returns if you change back to it.`;
  }

  return `Content type changed to ${label}. Nothing has been entered for ${label} yet.`;
};
