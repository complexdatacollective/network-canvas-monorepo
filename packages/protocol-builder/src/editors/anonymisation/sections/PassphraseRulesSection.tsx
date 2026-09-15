import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import PassphraseRulesField, {
  passphraseRulesIssue,
} from '../../../fields/PassphraseRulesField.tsx';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';

/** The schema keeps the passphrase rules under one optional key. */
const VALIDATION_FIELD = 'validation';

const rulesValidation = {
  custom: messageRuleValidation([passphraseRulesIssue]),
};

/**
 * Descriptors rather than the strings this section formats for itself:
 * `BuilderSection` renders the confirmation, so the warning a researcher reads
 * before losing the rules has to travel as something translatable.
 */
const capability: SectionCapability = {
  fields: [VALIDATION_FIELD],
  confirmClear: {
    title: anonymisationMessages.passphraseRulesClearTitle,
    description: anonymisationMessages.passphraseRulesClearDescription,
    confirmLabel: anonymisationMessages.passphraseRulesClearConfirm,
  },
};

/**
 * Whether the passphrase has to meet any requirements.
 *
 * A capability, because the schema's own answer to "no rules" is that the key
 * is not there: a stage may perfectly well let a participant choose whatever
 * they like. Switching it off therefore throws the rules away rather than
 * remembering them, and says so first.
 */
export default function PassphraseRulesSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(anonymisationMessages.passphraseRulesTitle)}
      description={intl.formatMessage(
        anonymisationMessages.passphraseRulesDescription,
      )}
      capability={capability}
    >
      {/* The rule list sits directly under the section's own heading, as
          Architect's does (`sections/Anonymisation/AnonymisationValidation.tsx`
          renders the shared `Validations` with no control label of its own).
          The field is still registered — it is what carries the rules into the
          stage document and what refuses a save over a length no passphrase
          could have — and its label is what names the list for assistive
          technology, so it is hidden rather than dropped: said aloud it would
          repeat the heading immediately above it. */}
      <Field<typeof PassphraseRulesField>
        name={VALIDATION_FIELD}
        component={PassphraseRulesField}
        label={intl.formatMessage(
          anonymisationMessages.passphraseRulesFieldLabel,
        )}
        labelHidden
        hint={intl.formatMessage(
          anonymisationMessages.passphraseRulesFieldHint,
        )}
        {...rulesValidation}
      />
    </BuilderSection>
  );
}
