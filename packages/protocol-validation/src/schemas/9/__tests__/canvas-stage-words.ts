import { localized } from '../../../utils/test-utils.ts';

/**
 * The settings a Network Composer holds, for a stage with edge types and no
 * groups: the wording the interview shows in place of its built-in text.
 */
export const networkComposerWords = () => ({
  addNamePlaceholder: localized('Type a name, then press Enter'),
  overtakenEditNotice: localized('Your edit has not been saved.'),
  tooltips: {
    addPerson: localized('Add node'),
    automaticLayout: localized('Automatic layout'),
    drawConnection: localized('Draw edge'),
  },
});

/** The settings a Narrative Pedigree holds, with at-risk statuses off. */
export const narrativePedigreeWords = () => ({
  keyHeading: localized('Key'),
  tooltips: {
    clearFocus: localized('Clear focus'),
    saveSnapshot: localized('Save snapshot'),
  },
  conditionText: {
    heading: localized('Conditions'),
    instruction: localized('Select a condition to see who it affects.'),
    notation: {
      affected: localized('Has this condition'),
      obligateAffected: localized('Will develop this condition'),
      obligateCarrier: localized('Carries this condition'),
      unknown: localized('Not known'),
    },
    snapshotCondition: localized('{title}: {condition}'),
    snapshotInheritance: localized(
      '{title}: {condition} — inheritance for {name}',
    ),
  },
});
