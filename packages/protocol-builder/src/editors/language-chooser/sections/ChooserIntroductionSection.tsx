import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedRichTextField } from '../../../fields/LocalizedStringField.tsx';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import { languageChooserMessages } from './languageChooserMessages.ts';

const INTRODUCTION_CAPABILITY: SectionCapability = {
  fields: ['introduction'],
  confirmClear: {
    title: languageChooserMessages.clearIntroductionTitle,
    description: languageChooserMessages.clearIntroductionDescription,
    confirmLabel: languageChooserMessages.clearIntroductionConfirm,
  },
};

/** What the participant reads above the languages they choose between. */
export default function ChooserIntroductionSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(languageChooserMessages.introductionTitle)}
      description={intl.formatMessage(
        languageChooserMessages.introductionDescription,
      )}
      capability={INTRODUCTION_CAPABILITY}
    >
      <Field<typeof LocalizedRichTextField>
        name="introduction"
        component={LocalizedRichTextField}
        label={intl.formatMessage(languageChooserMessages.introductionLabel)}
      />
    </BuilderSection>
  );
}
