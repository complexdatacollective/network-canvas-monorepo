import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import RichTextField from '../../fields/RichTextField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import BuilderSection from '../BuilderSection.tsx';
import { pedigreeMessages } from './pedigreeMessages.ts';

const CENSUS_PROMPT_FIELD = 'censusPrompt';

/**
 * The one question the pedigree asks while the participant builds their
 * family.
 *
 * Deliberately not the shared prompt list: a pedigree does not rotate through
 * prompts, it shows this one for the whole census, and the schema holds it as
 * a single string rather than an ordered array.
 */
export default function CensusPromptSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(pedigreeMessages.censusTitle)}
      description={intl.formatMessage(pedigreeMessages.censusDescription)}
    >
      <Field<typeof RichTextField>
        name={CENSUS_PROMPT_FIELD}
        component={RichTextField}
        singleLine
        label={intl.formatMessage(pedigreeMessages.censusFieldLabel)}
        hint={intl.formatMessage(pedigreeMessages.censusFieldHint)}
        placeholder={intl.formatMessage(pedigreeMessages.censusPlaceholder)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
