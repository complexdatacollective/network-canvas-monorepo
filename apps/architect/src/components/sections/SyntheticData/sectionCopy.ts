/**
 * The researcher-facing prose the stage editor's "Synthetic data" section
 * opens with (spec revision 2, item 1), and the headings of the two blocks
 * beneath it.
 *
 * Held apart from the component for one reason: every string here is a WHOLE
 * externalisable sentence, and keeping them together is what makes that
 * visible. There is no sentence assembled from clauses and no grammar
 * interpolated into one — the five "what these parameters govern" alternatives
 * are five sentences rather than one with a phrase swapped, because "creates
 * nodes", "connects them" and "costs attention" are different claims, and a
 * localiser handed the pieces could not put them back together in another
 * language's order.
 */

/** What synthetic data IS, said once on every stage that has a section. */
export const SECTION_PURPOSE =
  'Synthetic data fills a protocol with realistic example answers. Use it to preview a stage as a participant would meet it, and to check that an export of your data looks the way you expect. None of it is ever shown to a real participant.';

/** What this stage's own parameters govern, one per synthetic factory. */
export const PARAMETERS_COUNT_ONLY =
  'The parameters here decide how many nodes a generated interview creates on this stage, and how much of a participant’s attention the stage is assumed to cost.';
export const PARAMETERS_TOPOLOGY_ONLY =
  'The parameters here decide how densely a generated interview connects the network on this stage, and how much of a participant’s attention the stage is assumed to cost.';
export const PARAMETERS_COUNT_AND_TOPOLOGY =
  'The parameters here decide how many nodes a generated interview creates on this stage, how densely it connects them, and how much of a participant’s attention the stage is assumed to cost.';
export const PARAMETERS_VALUES_ONLY =
  'This stage creates no nodes or edges of its own, so its only stage-level parameter is how much of a participant’s attention it is assumed to cost.';
export const PARAMETERS_NO_DATA =
  'This stage records no answers, so its only parameter is how much of a participant’s attention it is assumed to cost.';

/** The in-situ variable sub-editors (spec revision 2, item 4). */
export const ATTRIBUTES_HEADING = 'Attributes this stage assigns';
export const ATTRIBUTES_DESCRIPTION =
  'These attributes belong to the codebook, and this stage is what assigns them. Shape the values a generated interview gives them here, or in the Codebook — it is the same setting either way.';

/** The per-panel nomination odds (spec revision 2, item 5). */
export const PANELS_HEADING = 'Side panels';
export const PANELS_DESCRIPTION =
  'A side panel offers the participant people they have already named. These settings decide how readily a generated participant takes one of them back, and are the same settings the panel’s own editor shows.';
