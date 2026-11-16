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
 * Screen-reader text stays English in every language, so each variant is a
 * whole English sentence chosen by branch rather than assembled from
 * fragments; it never reads "1 stages remain".
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
  const left =
    remaining === 0
      ? 'No stages remain.'
      : remaining === 1
        ? '1 stage remains.'
        : `${remaining} stages remain.`;
  return `Deleted stage ${position}. ${left}`;
};
