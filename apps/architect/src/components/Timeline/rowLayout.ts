/**
 * One grid template for every row on the timeline — stage rows, the insertion
 * points between them, and the trailing "Add new stage" control — so the
 * numbered badge, the plus badges and the vertical spine stay on one axis.
 *
 * The spine is a 4px line absolutely positioned at `left-1/2` of the timeline
 * wrapper. The badge only lands on it if the badge's grid track is EXACTLY
 * centred in a row that is itself centred in that wrapper, which is why the
 * flanking tracks are `minmax(0, 1fr)` rather than the bare `1fr` this used to
 * carry: a bare `1fr` means `minmax(auto, 1fr)`, whose floor is the track's
 * min-content width, so a long stage label — or the trailing action cluster —
 * would quietly widen one side and push the badge off the line. `minmax(0,1fr)`
 * has no content floor, so the two flanks are equal by construction at every
 * width and the spine cannot drift.
 *
 * `w-full max-w-3xl` replaces a hard `w-2xl` (672px): the fixed width was the
 * binding constraint on the horizontal overflow at phone widths, and 3xl lines
 * the rows up with `ProtocolInfoCard` above them. The gap closes up below 40rem
 * of container width so the thumbnail and label keep usable room on a phone.
 */
export const timelineRowGrid =
  'grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 @min-[40rem]:gap-10';
