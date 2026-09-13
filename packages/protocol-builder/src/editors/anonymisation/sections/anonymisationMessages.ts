import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything the anonymisation sections say.
 *
 * One file for the area rather than descriptors beside each section's markup,
 * because most of what this family says is rendered somewhere else: the
 * confirmation `BuilderSection` shows before the passphrase rules are switched
 * off, the refusals a form's error region decodes, and the name a host gives
 * the codebook edit a checkbox here makes. A translator reading this file sees
 * the whole of what a researcher configuring an anonymisation stage reads,
 * including the sentences no component in this directory renders itself.
 *
 * A "passphrase" is the secret a PARTICIPANT chooses, and it protects their own
 * answers rather than the researcher's protocol: nothing here is a password for
 * signing in, and the researcher writing this copy will never see the
 * passphrase itself.
 */
export const anonymisationMessages = defineMessages({
  explanationTitle: {
    id: 'protocolBuilder.anonymisation.explanationTitle',
    defaultMessage: 'Task explanation',
    description:
      'Heading of the section where a researcher writes what a participant reads before being asked to choose a passphrase — the secret that protects some of their own answers.',
  },
  explanationDescription: {
    id: 'protocolBuilder.anonymisation.explanationDescription',
    defaultMessage:
      'Explain the anonymisation process to participants before they enter their passphrase.',
    description:
      'Description under the heading of the passphrase-explanation section, telling the researcher what this explanation has to cover.',
  },
  explanationHeadingLabel: {
    id: 'protocolBuilder.anonymisation.explanationHeadingLabel',
    defaultMessage: 'Title',
    description:
      'Label of the field holding the heading at the top of the screen where a participant is asked for a passphrase.',
  },
  explanationHeadingPlaceholder: {
    id: 'protocolBuilder.anonymisation.explanationHeadingPlaceholder',
    defaultMessage: 'This interview uses enhanced privacy protection',
    description:
      'Placeholder shown in the empty explanation-heading field. An example of the heading a participant would read, so it is written in the participant’s second person rather than the researcher’s.',
  },
  explanationBodyLabel: {
    id: 'protocolBuilder.anonymisation.explanationBodyLabel',
    defaultMessage: 'Body',
    description:
      'Label of the field holding the prose a participant reads before being asked to choose a passphrase.',
  },
  explanationBodyPlaceholder: {
    id: 'protocolBuilder.anonymisation.explanationBodyPlaceholder',
    defaultMessage:
      "Enter your passphrase below, and click the 'continue' button.",
    description:
      'Placeholder shown in the empty explanation field. An example of the prose a participant would read, so it is written in the participant’s second person rather than the researcher’s.',
  },

  passphraseRulesTitle: {
    id: 'protocolBuilder.anonymisation.passphraseRulesTitle',
    defaultMessage: 'Passphrase validation',
    description:
      'Heading of the section where a researcher decides what a participant’s passphrase has to look like. The requirements are lengths only: a shortest and a longest.',
  },
  passphraseRulesDescription: {
    id: 'protocolBuilder.anonymisation.passphraseRulesDescription',
    defaultMessage: 'Choose which validation rules apply to the passphrase.',
    description:
      'Description under the heading of the passphrase-rules section. A validation rule is a requirement the participant’s passphrase has to meet; here they are lengths only.',
  },
  passphraseRulesFieldLabel: {
    id: 'protocolBuilder.anonymisation.passphraseRulesFieldLabel',
    defaultMessage: 'Passphrase rules',
    description:
      'Label of the control inside the passphrase-rules section that holds the rules themselves. Deliberately the same words as the section heading above it — the section holds this one control — but a separate message, because a translator may need to distinguish a heading from the name of a form control.',
  },
  passphraseRulesFieldHint: {
    id: 'protocolBuilder.anonymisation.passphraseRulesFieldHint',
    defaultMessage:
      'A longer passphrase is harder to guess and harder to remember. A participant who forgets it cannot recover the answers it protects.',
    description:
      'Guidance under the passphrase-rules control, naming the trade-off a researcher is making when they set a minimum length.',
  },
  passphraseRulesMinimumAboveMaximum: {
    id: 'protocolBuilder.anonymisation.passphraseRulesMinimumAboveMaximum',
    defaultMessage:
      'The shortest passphrase you allow cannot be longer than the longest one.',
    description:
      'Refusal shown on the passphrase-rules control when the minimum length the researcher set is greater than the maximum, so no passphrase could satisfy both.',
  },
  passphraseRulesMaximumBelowOne: {
    id: 'protocolBuilder.anonymisation.passphraseRulesMaximumBelowOne',
    defaultMessage:
      'The longest passphrase you allow must be at least one character.',
    description:
      'Refusal shown on the passphrase-rules control when the researcher has set the longest allowed passphrase to zero. The interview asks every participant for a passphrase and will not accept an empty one, so a maximum of zero is a length no passphrase can have and the interview could never be finished.',
  },
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

  encryptedAttributesTitle: {
    id: 'protocolBuilder.anonymisation.encryptedAttributesTitle',
    defaultMessage: 'Encrypted attributes',
    description:
      'Heading of the section where a researcher chooses which codebook attributes — the named things an interview records about a node — the participant’s passphrase protects.',
  },
  encryptedAttributesDescription: {
    id: 'protocolBuilder.anonymisation.encryptedAttributesDescription',
    defaultMessage:
      'Select the text attributes for each node type that should be encrypted.',
    description:
      'Description under the heading of the encrypted-attributes section. Only attributes holding text can be encrypted, which is why they are named as text attributes here.',
  },
  storageNotice: {
    id: 'protocolBuilder.anonymisation.storageNotice',
    defaultMessage:
      'An encrypted attribute is stored so that only the passphrase can unlock it. It cannot be read, exported, or recovered without it.',
    description:
      'Notice at the top of the encrypted-attributes section, warning the researcher that encryption applies to their own copy of the data too: an answer whose passphrase is lost cannot be exported or recovered by anyone.',
  },
  noTypesEmptyState: {
    id: 'protocolBuilder.anonymisation.noTypesEmptyState',
    defaultMessage:
      'This protocol has no types yet, so there is nothing to encrypt. Add one in the codebook.',
    description:
      'Shown in place of the encrypted-attributes list when the codebook — the protocol’s definition of what an interview records — holds no node types at all, so there are no attributes to offer.',
  },
  noTextAttributes: {
    id: 'protocolBuilder.anonymisation.noTextAttributes',
    defaultMessage:
      'This type has no text attributes, so it has nothing that can be encrypted.',
    description:
      'Shown under one node type’s heading in the encrypted-attributes section when that type has attributes but none of them hold text. Only text can be encrypted.',
  },
  attributeGroupLabel: {
    id: 'protocolBuilder.anonymisation.attributeGroupLabel',
    defaultMessage: 'Encrypted attributes for {typeName}',
    description:
      'Accessible name of one node type’s group of checkboxes in the encrypted-attributes section — read aloud rather than shown, because the type’s name is already a heading above it. typeName is the researcher’s own name for the node type, such as "person".',
  },
  encryptedAnnouncement: {
    id: 'protocolBuilder.anonymisation.encryptedAnnouncement',
    defaultMessage: '{attributeName} is now encrypted.',
    description:
      'Announced to a screen reader after a checkbox in the encrypted-attributes section is ticked and the codebook change has been applied. Never shown on screen — the checkbox itself is the visible confirmation. attributeName is the researcher’s own name for the attribute.',
  },
  notEncryptedAnnouncement: {
    id: 'protocolBuilder.anonymisation.notEncryptedAnnouncement',
    defaultMessage: '{attributeName} is no longer encrypted.',
    description:
      'Announced to a screen reader after a checkbox in the encrypted-attributes section is cleared and the codebook change has been applied. Never shown on screen. attributeName is the researcher’s own name for the attribute.',
  },

  typeSwitchDescription: {
    id: 'protocolBuilder.anonymisation.typeSwitchDescription',
    defaultMessage: 'Enable encryption for attributes belonging to this type.',
    description:
      'Description under one node type’s own switch in the encrypted-attributes section, saying what switching it on is for. A node type is a kind of thing an interview records, such as "person".',
  },
  clearTypeConfirmTitle: {
    id: 'protocolBuilder.anonymisation.clearTypeConfirmTitle',
    defaultMessage: 'This will clear selected attributes',
    description:
      'Title of the confirmation shown when a researcher switches encryption off for a whole node type, which un-encrypts every attribute of that type at once.',
  },
  clearTypeConfirmDescription: {
    id: 'protocolBuilder.anonymisation.clearTypeConfirmDescription',
    defaultMessage:
      'Every encrypted attribute of the {typeName} type will stop being encrypted. Do you want to continue?',
    description:
      'Body of the confirmation shown when a researcher switches encryption off for a whole node type. typeName is the researcher’s own name for the type, such as "person".',
  },
  clearTypeConfirmLabel: {
    id: 'protocolBuilder.anonymisation.clearTypeConfirmLabel',
    defaultMessage: 'Clear encrypted attributes',
    description:
      'Label of the button that confirms un-encrypting every attribute of one node type at once.',
  },
  clearedTypeAnnouncement: {
    id: 'protocolBuilder.anonymisation.clearedTypeAnnouncement',
    defaultMessage:
      'No attribute of the {typeName} type is encrypted any more.',
    description:
      'Announced to a screen reader once every attribute of one node type has stopped being encrypted. Never shown on screen — the section closing is the visible confirmation. typeName is the researcher’s own name for the type.',
  },
});
