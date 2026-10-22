import type { FramingId, FramingSetting } from '@codaco/protocol-validation';

/**
 * The words a Family Pedigree stage describes family members in. A stage
 * that leaves the choice to the participant uses the one they chose, recorded
 * in its stage metadata, and until they have chosen, the words that assume no
 * gender. A stage with no setting uses gendered words.
 */
export function pedigreeFraming(
  setting: FramingSetting | undefined,
  chosen: FramingId | undefined,
): FramingId {
  if (setting === 'participantPreference') return chosen ?? 'gamete';
  return setting ?? 'gendered';
}
