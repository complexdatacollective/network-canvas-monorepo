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
) => `Moved stage ${fromPosition} to position ${toPosition} of ${total}.`;

export const getStageDeletedAnnouncement = (
  position: number,
  remaining: number,
) => {
  if (remaining <= 0) {
    return `Deleted stage ${position}. No stages remain.`;
  }

  if (remaining === 1) {
    return `Deleted stage ${position}. 1 stage remains.`;
  }

  return `Deleted stage ${position}. ${remaining} stages remain.`;
};
