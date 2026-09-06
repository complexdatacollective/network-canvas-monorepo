import { useAppIntl } from '@codaco/app-i18n/react';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';
import PassphraseRulesControl, {
  passphraseRulesIssue,
} from './PassphraseRulesControl.tsx';

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
export default function AnonymisationValidationSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(anonymisationMessages.passphraseRulesTitle)}
      description={intl.formatMessage(
        anonymisationMessages.passphraseRulesDescription,
      )}
      capability={capability}
    >
      <ProtocolField<typeof PassphraseRulesControl>
        name={VALIDATION_FIELD}
        component={PassphraseRulesControl}
        label={intl.formatMessage(
          anonymisationMessages.passphraseRulesFieldLabel,
        )}
        hint={intl.formatMessage(
          anonymisationMessages.passphraseRulesFieldHint,
        )}
        {...rulesValidation}
      />
    </BuilderSection>
  );
}
