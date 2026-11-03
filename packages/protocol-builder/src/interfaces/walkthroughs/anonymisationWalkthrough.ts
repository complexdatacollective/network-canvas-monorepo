import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { anonymisationMessages } from '../../editors/anonymisation/sections/anonymisationMessages.ts';
import {
  closingSteps,
  hasText,
  introStep,
  stageOfType,
} from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.anonymisation.introTitle',
    defaultMessage: 'Setting up an Anonymisation stage',
    description:
      'Title of the first step of a guided walkthrough of the Anonymisation stage editor. "Anonymisation" is the name of the stage type. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.anonymisation.introBody',
    defaultMessage:
      'This stage asks the participant to choose a passphrase, which then protects the identifying details you pick, such as names. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the Anonymisation walkthrough. A passphrase is a secret the participant chooses; it encrypts some of their answers.',
  },
  explanationTitle: {
    id: 'protocolBuilder.walkthrough.anonymisation.explanationTitle',
    defaultMessage: 'Explain the passphrase',
    description:
      'Title of the walkthrough step about the text a participant reads before choosing a passphrase.',
  },
  explanationBody: {
    id: 'protocolBuilder.walkthrough.anonymisation.explanationBody',
    defaultMessage:
      'The participant reads this text before they choose a passphrase. Write what it protects and what they need to do. A heading can go on the first line.',
    description:
      'Body of the walkthrough step about the text a participant reads before choosing a passphrase.',
  },
  rulesTitle: {
    id: 'protocolBuilder.walkthrough.anonymisation.rulesTitle',
    defaultMessage: 'Set passphrase rules',
    description:
      'Title of the walkthrough step about the rules a passphrase has to meet, such as a minimum length.',
  },
  rulesBody: {
    id: 'protocolBuilder.walkthrough.anonymisation.rulesBody',
    defaultMessage:
      'Switch this on to require a minimum or maximum length. The participant cannot continue until their passphrase meets the rules. Left off, any passphrase is accepted.',
    description:
      'Body of the walkthrough step about the rules a passphrase has to meet.',
  },
  attributesTitle: {
    id: 'protocolBuilder.walkthrough.anonymisation.attributesTitle',
    defaultMessage: 'Choose what the passphrase protects',
    description:
      'Title of the walkthrough step about which attributes are encrypted with the passphrase.',
  },
  attributesBody: {
    id: 'protocolBuilder.walkthrough.anonymisation.attributesBody',
    defaultMessage:
      'Select the text attributes, for each node type, that are encrypted with the passphrase. This is a setting of the attributes themselves, so it applies across the whole protocol and is saved straight away.',
    description:
      'Body of the walkthrough step about which attributes are encrypted with the passphrase. A node type is a kind of person or thing in the network; an attribute is something recorded about it. The change is written to the codebook at once, not when the stage is saved.',
  },
});

const anonymisation = (stage: Stage) => stageOfType(stage, 'Anonymisation');

/**
 * The Anonymisation editor, one step per section, in the order the editor
 * shows them. Only the explanation is required by the schema.
 */
export const anonymisationWalkthrough: StageWalkthrough = [
  introStep('Anonymisation', messages.introTitle, messages.introBody),
  {
    id: 'explanation',
    title: messages.explanationTitle,
    body: messages.explanationBody,
    target: { section: anonymisationMessages.explanationTitle },
    done: (stage) => hasText(anonymisation(stage)?.explanationText),
  },
  {
    id: 'rules',
    title: messages.rulesTitle,
    body: messages.rulesBody,
    target: { section: anonymisationMessages.passphraseRulesTitle },
    optional: true,
  },
  {
    id: 'attributes',
    title: messages.attributesTitle,
    body: messages.attributesBody,
    target: { section: anonymisationMessages.encryptedAttributesTitle },
    optional: true,
  },
  ...closingSteps,
];
