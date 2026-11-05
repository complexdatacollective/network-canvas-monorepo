import { localized } from '../../../utils/test-utils.ts';

/** The settings a Narrative Pedigree holds, with at-risk statuses off. */
export const narrativePedigreeWords = () => ({
  saveSnapshot: localized('Save snapshot'),
  conditionText: {
    selectCondition: localized('Select a condition'),
    snapshotCondition: localized('{title}: {condition}'),
    snapshotInheritance: localized(
      '{title}: {condition} — inheritance for {name}',
    ),
  },
});
