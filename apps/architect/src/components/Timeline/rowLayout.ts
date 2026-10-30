/**
 * One grid template for every row on the timeline — stage rows, the insertion
 * points between them, and the trailing "Add new stage" control — so the
 * stops, the plus badges and the vertical spine stay on one axis.
 *
 * Every row's middle track is 3.5rem, the width of a stage's stop, so a plus
 * badge centred in it shares the stop's axis whichever layout is in force.
 *
 * From 40rem of timeline width, labels alternate sides of a centred spine, as
 * on the start screen. The stop only lands on the spine if its track is
 * EXACTLY centred in a row that is itself centred in the timeline, which is
 * why the flanking tracks are `minmax(0, 1fr)` rather than a bare `1fr`: a bare
 * `1fr` means `minmax(auto, 1fr)`, whose floor is the track's min-content
 * width, so a long stage label — or the trailing action cluster — would
 * quietly widen one side and push the stop off the line. `minmax(0,1fr)` has
 * no content floor, so the two flanks are equal by construction at every width
 * and the spine cannot drift.
 *
 * Below 40rem two flanks would leave each label a few words' width, so every
 * row puts its number, stop and label in that order along a spine near the
 * start edge, as the interview's stage menu does.
 *
 * `w-full max-w-3xl` replaces a hard `w-2xl` (672px): the fixed width was the
 * binding constraint on the horizontal overflow at phone widths, and 3xl lines
 * the rows up with `ProtocolInfoCard` above them.
 */
export const timelineRowGrid =
  'grid w-full max-w-3xl grid-cols-[2rem_3.5rem_minmax(0,1fr)] items-center gap-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] @min-[40rem]:gap-10';

/**
 * Where the spine runs, for the line itself and for every stretch of it a row
 * draws: the centre of the middle track. Below 40rem that is the rows' 1rem
 * inline padding, the 2rem number track and the 1rem gap, then half the 3.5rem
 * stop track; every row fills the timeline's width there, so the offset holds
 * in the timeline and in each row alike.
 */
export const spineAxis =
  'inset-s-[5.75rem] -translate-x-1/2 rtl:translate-x-1/2 @min-[40rem]:inset-s-1/2';

/**
 * The spine behind a row, as the start screen's timeline draws it: one colour
 * above the row's middle, where a stage's stop sits, and another below.
 */
export const segmentBackground = (above: string, below: string) =>
  `linear-gradient(to bottom, ${above} 50%, ${below} 50%)`;
