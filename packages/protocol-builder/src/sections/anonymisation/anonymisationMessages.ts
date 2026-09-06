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
    defaultMessage: 'Passphrase explanation',
    description:
      'Heading of the section where a researcher writes what a participant reads before being asked to choose a passphrase — the secret that protects some of their own answers.',
  },
  explanationDescription: {
    id: 'protocolBuilder.anonymisation.explanationDescription',
    defaultMessage:
      'Explain what the passphrase protects and what happens if it is lost, before the participant is asked to choose one.',
    description:
      'Description under the heading of the passphrase-explanation section, telling the researcher what this explanation has to cover.',
  },
  explanationHeadingLabel: {
    id: 'protocolBuilder.anonymisation.explanationHeadingLabel',
    defaultMessage: 'Explanation heading',
    description:
      'Label of the field holding the heading at the top of the screen where a participant is asked for a passphrase.',
  },
  explanationHeadingHint: {
    id: 'protocolBuilder.anonymisation.explanationHeadingHint',
    defaultMessage:
      'The heading at the top of the screen that asks for a passphrase.',
    description:
      'Guidance under the explanation-heading field, saying where in the interview that heading appears.',
  },
  explanationHeadingPlaceholder: {
    id: 'protocolBuilder.anonymisation.explanationHeadingPlaceholder',
    defaultMessage: 'This interview protects some of your answers',
    description:
      'Placeholder shown in the empty explanation-heading field. An example of the heading a participant would read, so it is written in the participant’s second person rather than the researcher’s.',
  },
  explanationBodyLabel: {
    id: 'protocolBuilder.anonymisation.explanationBodyLabel',
    defaultMessage: 'Explanation',
    description:
      'Label of the field holding the prose a participant reads before being asked to choose a passphrase.',
  },
  explanationBodyHint: {
    id: 'protocolBuilder.anonymisation.explanationBodyHint',
    defaultMessage:
      'Say which answers the passphrase protects, who can read them, and that the answers cannot be recovered without it. This is the only thing the participant reads before choosing one.',
    description:
      'Guidance under the explanation field, listing what the participant has to be told. "Recovered" is literal: an answer whose passphrase is forgotten is gone for good.',
  },
  explanationBodyPlaceholder: {
    id: 'protocolBuilder.anonymisation.explanationBodyPlaceholder',
    defaultMessage:
      'Some of your answers are stored so that only you can unlock them. Choose a passphrase you will remember: without it, those answers cannot be read again.',
    description:
      'Placeholder shown in the empty explanation field. An example of the prose a participant would read, so it is written in the participant’s second person rather than the researcher’s.',
  },

  passphraseRulesTitle: {
    id: 'protocolBuilder.anonymisation.passphraseRulesTitle',
    defaultMessage: 'Passphrase rules',
    description:
      'Heading of the section where a researcher decides what a participant’s passphrase has to look like. The requirements are lengths only: a shortest and a longest.',
  },
  passphraseRulesDescription: {
    id: 'protocolBuilder.anonymisation.passphraseRulesDescription',
    defaultMessage:
      'Require the passphrase to be a certain length. Without any rules, a participant may choose anything.',
    description:
      'Description under the heading of the passphrase-rules section. This capability can be switched off entirely, which is what "without any rules" means.',
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
  passphraseRulesUnreadable: {
    id: 'protocolBuilder.anonymisation.passphraseRulesUnreadable',
    defaultMessage:
      'These passphrase rules could not be read. Switch them off and set them again.',
    description:
      'Refusal shown on the passphrase-rules control when the rules stored on this stage are not in a shape the editor can read at all — a protocol edited by hand, or written by a newer version. Switching the section off discards them so they can be set again.',
  },
  passphraseRulesMinimumAboveMaximum: {
    id: 'protocolBuilder.anonymisation.passphraseRulesMinimumAboveMaximum',
    defaultMessage:
      'The shortest passphrase you allow cannot be longer than the longest one.',
    description:
      'Refusal shown on the passphrase-rules control when the minimum length the researcher set is greater than the maximum, so no passphrase could satisfy both.',
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
      'Choose which text attributes are protected by the participant’s passphrase.',
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
  typeUnavailableRefusal: {
    id: 'protocolBuilder.anonymisation.typeUnavailableRefusal',
    defaultMessage:
      'That type is not available right now, so the change was not made.',
    description:
      'Refusal shown in the encrypted-attributes section when the node type a checkbox belongs to is no longer part of the protocol this editor can see, so the change could not even be attempted.',
  },
  typeHeldRefusal: {
    id: 'protocolBuilder.anonymisation.typeHeldRefusal',
    defaultMessage:
      'Someone else is editing this type right now, so the change was not made. Try again in a moment.',
    description:
      'Refusal shown in the encrypted-attributes section when a collaborator holds the node type, so the codebook change was blocked rather than applied.',
  },
  editFailedRefusal: {
    id: 'protocolBuilder.anonymisation.editFailedRefusal',
    defaultMessage:
      'That change could not be made. Check the attribute in the codebook and try again.',
    description:
      'Refusal shown in the encrypted-attributes section when saving the codebook change threw with no explanation a researcher could act on. The last resort.',
  },
  encryptEditDescription: {
    id: 'protocolBuilder.anonymisation.encryptEditDescription',
    defaultMessage: 'Encrypt {attributeName} on {typeName}',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers. attributeName is the attribute being protected and typeName the node type it belongs to, both named by the researcher.',
  },
  stopEncryptingEditDescription: {
    id: 'protocolBuilder.anonymisation.stopEncryptingEditDescription',
    defaultMessage: 'Stop encrypting {attributeName} on {typeName}',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers, when encryption is switched off again. attributeName is the attribute and typeName the node type it belongs to, both named by the researcher.',
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
});
