import { defineMessages } from '@codaco/app-i18n/messages';

import { languageChooserMessages } from '../../editors/language-chooser/sections/languageChooserMessages.ts';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.languageChooser.introTitle',
    defaultMessage: 'Setting up a Language Chooser stage',
    description:
      'Title of the first step of a guided walkthrough of the Language Chooser stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.languageChooser.introBody',
    defaultMessage:
      'On this stage the participant picks the language the rest of their interview is shown in. There is little to set up: the choices come from the protocol itself. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description: 'Body of the first step of the Language Chooser walkthrough.',
  },
  headingTitle: {
    id: 'protocolBuilder.walkthrough.languageChooser.headingTitle',
    defaultMessage: 'Change the heading',
    description:
      'Title of the walkthrough step about the heading shown above the languages a participant chooses between.',
  },
  headingBody: {
    id: 'protocolBuilder.walkthrough.languageChooser.headingBody',
    defaultMessage:
      'Network Canvas supplies a heading shown above the languages, and it switches to the chosen language as soon as the participant picks one. Switch this on only if you want different words.',
    description:
      'Body of the walkthrough step about the heading shown above the languages a participant chooses between.',
  },
  languagesTitle: {
    id: 'protocolBuilder.walkthrough.languageChooser.languagesTitle',
    defaultMessage: 'Check the languages on offer',
    description:
      'Title of the walkthrough step about the list of languages a participant can choose between.',
  },
  languagesBody: {
    id: 'protocolBuilder.walkthrough.languageChooser.languagesBody',
    defaultMessage:
      'The participant chooses from every language this protocol is written in, listed here. To add or remove one, change the languages of the whole protocol; they cannot be changed on this stage.',
    description:
      'Body of the walkthrough step about the list of languages a participant can choose between. The list follows the languages of the whole protocol.',
  },
});

/**
 * The Language Chooser editor, one step per section, in the order the editor
 * shows them. Nothing on it has to be set, so every step is optional.
 */
export const languageChooserWalkthrough: StageWalkthrough = [
  introStep('LanguageChooser', messages.introTitle, messages.introBody),
  {
    id: 'heading',
    title: messages.headingTitle,
    body: messages.headingBody,
    target: { section: stageWordingMessages.title },
    optional: true,
  },
  {
    id: 'languages',
    title: messages.languagesTitle,
    body: messages.languagesBody,
    target: { section: languageChooserMessages.languagesTitle },
    optional: true,
  },
  ...closingSteps,
];
