import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The narrative pedigree sections' copy that leaves this family.
 *
 * One row noun so far: `DialogArrayField` builds "Edit …", "Remove this …?"
 * and its write refusals around it, and a string handed across that seam would
 * be a permanently English noun inside an otherwise translated sentence. The
 * rest of `sections/narrativePedigree/` still holds English `DEFAULT_COPY`
 * literals and joins this file when the family is converted.
 */
export const narrativePedigreeMessages = defineMessages({
  diseaseNoun: {
    id: 'protocolBuilder.narrativePedigree.diseaseNoun',
    defaultMessage: 'disease',
    description:
      'What one row of the disease list is called inside things said ABOUT it — "Edit disease", "Remove this disease?" — so it is lower case and singular. A disease here is a condition the stage draws on the family tree.',
  },
});
