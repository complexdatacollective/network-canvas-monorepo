import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
const defaultIntl = createAppIntl({ locale: 'en' });

import type { ContentSlotType } from './itemTypes';
const localeMessages = defineMessages({
  chosen: {
    id: 'architect.content.announcement.chosen',
    defaultMessage:
      'Content type set to {type, select, text {Text} image {Image} audio {Audio} other {Video}}. A content field for it has been added below.',
    description:
      'Live announcement when changing content type; all saved authored drafts remain intact.',
  },
  changed: {
    id: 'architect.content.announcement.changed',
    defaultMessage:
      'Content type changed to {type, select, text {Text} image {Image} audio {Audio} other {Video}}. {outcome, select, restored {The content you entered for {type, select, text {Text} image {Image} audio {Audio} other {Video}} earlier has been restored.} kept {The content you entered for the previous type is kept, and returns if you change back to it.} other {Nothing has been entered for {type, select, text {Text} image {Image} audio {Audio} other {Video}} yet.}}',
    description:
      'Live announcement when changing content type; all saved authored drafts remain intact.',
  },
});

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

export const getContentTypeChosenAnnouncement = (
  type: ContentSlotType,
  intl: IntlShape = defaultIntl,
): string => intl.formatMessage(localeMessages.chosen, { type });
export const getContentTypeChangedAnnouncement = (
  type: ContentSlotType,
  outcome: ContentDraftOutcome,
  intl: IntlShape = defaultIntl,
): string => intl.formatMessage(localeMessages.changed, { type, outcome });
