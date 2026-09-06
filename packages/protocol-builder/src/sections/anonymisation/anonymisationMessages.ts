import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The anonymisation sections' copy that leaves this family.
 *
 * The confirmation `BuilderSection` shows before the passphrase rules are
 * switched off. Declared here as descriptors rather than handed over as
 * strings: the one place a researcher is warned what they are about to lose
 * would otherwise be the one place that stayed English.
 */
export const anonymisationMessages = defineMessages({
  passphraseRulesClearTitle: {
    id: 'protocolBuilder.anonymisation.passphraseRulesClearTitle',
    defaultMessage: 'Remove the passphrase rules?',
    description:
      'Title of the confirmation shown before a researcher switches off the requirements a participant’s passphrase has to meet. Switching them off discards them, which is why it is confirmed.',
  },
  passphraseRulesClearDescription: {
    id: 'protocolBuilder.anonymisation.passphraseRulesClearDescription',
    defaultMessage:
      'The lengths you set will be discarded, and participants will be able to choose any passphrase.',
    description:
      'Body of the confirmation shown before the passphrase rules are switched off, saying what is lost. The passphrase protects the answers the participant gives on this stage.',
  },
  passphraseRulesClearConfirm: {
    id: 'protocolBuilder.anonymisation.passphraseRulesClearConfirm',
    defaultMessage: 'Remove the rules',
    description:
      'Button that confirms switching off the passphrase rules and discarding them.',
  },
});
