import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import RichTextField from '../../../fields/RichTextField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { pedigreeMessages } from './pedigreeMessages.ts';

const CENSUS_PROMPT_FIELD = 'censusPrompt';

/**
 * The one question the pedigree asks while the participant builds their
 * family.
 *
 * Deliberately not the shared prompt list: a pedigree does not rotate through
 * prompts, it shows this one for the whole census, and the schema holds it as
 * a single string rather than an ordered array.
 *
 * Full markdown, unlike every rotating prompt, which is `singleLine`. This one
 * question stands on screen for the whole family-building phase, so it is the
 * one prompt worth a second paragraph or a link to the study's own
 * instructions — and narrowing it would not merely withhold the toolbar: the
 * markdown a stored prompt already carries is parsed against the same
 * restriction, so links would be dropped and paragraphs run together on
 * screen, and written back over the researcher's own text at their next edit.
 */
export default function CensusPromptSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection title={intl.formatMessage(pedigreeMessages.censusTitle)}>
      <Field<typeof RichTextField>
        name={CENSUS_PROMPT_FIELD}
        component={RichTextField}
        label={intl.formatMessage(pedigreeMessages.censusFieldLabel)}
        hint={intl.formatMessage(pedigreeMessages.censusFieldHint)}
        placeholder={intl.formatMessage(pedigreeMessages.censusPlaceholder)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
