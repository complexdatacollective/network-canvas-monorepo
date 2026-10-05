import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
const localeMessages = defineMessages({
  moved: {
    id: 'architect.timeline.announcement.moved',
    defaultMessage:
      'Moved stage {fromPosition, number} to position {toPosition, number} of {total, number}.',
    description: 'Live announcement after a timeline operation succeeds.',
  },
  deleted: {
    id: 'architect.timeline.announcement.deleted',
    defaultMessage:
      'Deleted stage {position, number}. {remaining, plural, =0 {No stages remain.} one {1 stage remains.} other {# stages remain.}}',
    description: 'Live announcement after a timeline operation succeeds.',
  },
});
const defaultIntl = createAppIntl({ locale: 'en' });

/**
 * What the timeline's `aria-live` region says after a stage is moved or
 * deleted.
 *
 * Both are reached from the pointer paths as well as the keyboard ones — the
 * move announcement fires in the shared commit the drag also ends in, and the
 * delete announcement fires when the confirmation is accepted however it was
 * raised. A reorder that only a sighted user is told about is not a reorder
 * everyone was told about.
 *
 * Each variant is a whole sentence chosen by branch rather than assembled from
 * fragments, so it can be localised as a unit and never reads "1 stages
 * remain".
 */

export const getStageMovedAnnouncement = (
  fromPosition: number,
  toPosition: number,
  total: number,
  intl: IntlShape = defaultIntl,
) =>
  intl.formatMessage(localeMessages.moved, { fromPosition, toPosition, total });
export const getStageDeletedAnnouncement = (
  position: number,
  remaining: number,
  intl: IntlShape = defaultIntl,
) => intl.formatMessage(localeMessages.deleted, { position, remaining });
