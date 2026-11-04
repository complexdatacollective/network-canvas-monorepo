import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { CONTENT_FIELD } from '../../editors/finish-session/sections/ClosingScreenSection.tsx';
import { FINISHED_CONTENT_FIELD } from '../../editors/finish-session/sections/FinishedScreenSection.tsx';
import { finishSessionMessages } from '../../editors/finish-session/sections/finishSessionMessages.ts';
import { MODE_FIELD } from '../../editors/finish-session/sections/ModeSection.tsx';
import { OUTCOME_FIELD } from '../../editors/finish-session/sections/OutcomeSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import {
  finishStep,
  guidanceStep,
  hasText,
  introStep,
  stageOfType,
} from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.finishSession.introTitle',
    defaultMessage: 'Setting up a Finish Screen stage',
    description:
      'Title of the first step of a guided walkthrough of the Finish Screen stage editor. Finish Screen is the name of an interface; a stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.finishSession.introBody',
    defaultMessage:
      'A Finish Screen ends the interview. A protocol can have more than one, so different routes through the interview can end differently. You can keep editing while this walkthrough is open.',
    description: 'Body of the first step of the Finish Screen walkthrough.',
  },
  modeTitle: {
    id: 'protocolBuilder.walkthrough.finishSession.modeTitle',
    defaultMessage: 'Choose how the interview ends',
    description:
      'Title of the walkthrough step about whether participants confirm that they are finished.',
  },
  modeBody: {
    id: 'protocolBuilder.walkthrough.finishSession.modeBody',
    defaultMessage:
      'With **Participants confirm**, participants read a closing screen and press a button to finish, and can still go back until they do. With **Finish automatically**, the interview ends as soon as they reach this stage.',
    description:
      'Body of the walkthrough step about whether participants confirm that they are finished. Markdown; the bold phrases are the labels of the two options in the editor.',
  },
  closingTitle: {
    id: 'protocolBuilder.walkthrough.finishSession.closingTitle',
    defaultMessage: 'Write the closing screen',
    description:
      'Title of the walkthrough step about the text shown before the participant finishes the interview.',
  },
  closingBody: {
    id: 'protocolBuilder.walkthrough.finishSession.closingBody',
    defaultMessage:
      'Participants read this text, with the Finish button beneath it, before they end the interview. Put a heading on its first line if you want one.',
    description:
      'Body of the walkthrough step about the text shown before the participant finishes the interview. Finish is the label of the button that ends the interview.',
  },
  finishedTitle: {
    id: 'protocolBuilder.walkthrough.finishSession.finishedTitle',
    defaultMessage: 'Write the finished screen',
    description:
      'Title of the walkthrough step about the text shown once the interview has ended.',
  },
  finishedBody: {
    id: 'protocolBuilder.walkthrough.finishSession.finishedBody',
    defaultMessage:
      'Participants read this text once the interview has ended, and again whenever the finished interview is opened. It starts with wording Network Canvas supplies, which you can change.',
    description:
      'Body of the walkthrough step about the text shown once the interview has ended.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.finishSession.wordingTitle',
    defaultMessage: 'Change the finishing words',
    description:
      'Title of the walkthrough step about the wording of the Finish button and the messages around it.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.finishSession.wordingBody',
    defaultMessage:
      'Network Canvas supplies the words of the Finish button, the question it asks before ending the interview, and the message shown if the interview could not be ended. Switch this on to change them for this stage.',
    description:
      'Body of the walkthrough step about the wording of the Finish button and the messages around it.',
  },
  outcomeTitle: {
    id: 'protocolBuilder.walkthrough.finishSession.outcomeTitle',
    defaultMessage: 'Record how the interview ended',
    description: 'Title of the walkthrough step about the outcome.',
  },
  outcomeBody: {
    id: 'protocolBuilder.walkthrough.finishSession.outcomeBody',
    defaultMessage:
      'The outcome you choose here is saved with every interview that ends here and included in data exports, so endings can be told apart later. Participants never see it.',
    description: 'Body of the walkthrough step about the outcome.',
  },
});

const finishSession = (stage: Stage) => stageOfType(stage, 'FinishSession');

/**
 * The Finish Screen editor, one step per section. The closing screen step
 * appears only while the stage asks participants to confirm, because the
 * editor shows that section only then.
 */
export const finishSessionWalkthrough: StageWalkthrough = [
  introStep('FinishSession', messages.introTitle, messages.introBody),
  {
    id: 'mode',
    title: messages.modeTitle,
    body: messages.modeBody,
    target: { section: finishSessionMessages.modeTitle, field: MODE_FIELD },
    done: (stage) => finishSession(stage)?.mode !== undefined,
  },
  {
    id: 'closing',
    title: messages.closingTitle,
    body: messages.closingBody,
    target: {
      section: finishSessionMessages.closingTitle,
      field: CONTENT_FIELD,
    },
    done: (stage) => hasText(finishSession(stage)?.content),
  },
  {
    id: 'finished',
    title: messages.finishedTitle,
    body: messages.finishedBody,
    target: {
      section: finishSessionMessages.finishedTitle,
      field: FINISHED_CONTENT_FIELD,
    },
    done: (stage) => hasText(finishSession(stage)?.finishedContent),
  },
  {
    id: 'wording',
    title: messages.wordingTitle,
    body: messages.wordingBody,
    target: { section: stageWordingMessages.title },
    optional: true,
  },
  {
    id: 'outcome',
    title: messages.outcomeTitle,
    body: messages.outcomeBody,
    target: {
      section: finishSessionMessages.outcomeTitle,
      field: OUTCOME_FIELD,
    },
    done: (stage) => finishSession(stage)?.outcome !== undefined,
  },
  // The editor has no skip logic: a session always ends here.
  guidanceStep,
  finishStep,
];
