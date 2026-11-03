import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { backgroundSectionTitle } from '../../sections/background/BackgroundSection.tsx';
import { canvasBehavioursMessages } from '../../sections/canvas-behaviours/canvasBehavioursMessages.ts';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.sociogram.introTitle',
    defaultMessage: 'Setting up a Sociogram stage',
    description:
      'Title of the first step of a guided walkthrough of the Sociogram stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.sociogram.introBody',
    defaultMessage:
      'On a Sociogram, the participant works with the people they have already named on a canvas: placing them, connecting the ones who know each other, or marking some of them. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description: 'Body of the first step of the Sociogram walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.sociogram.subjectTitle',
    defaultMessage: 'Choose who goes on the canvas',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.sociogram.subjectBody',
    defaultMessage:
      'Pick the node type shown on the canvas. Everyone of that type named earlier in the interview appears here. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.sociogram.filterTitle',
    defaultMessage: 'Show only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.sociogram.filterBody',
    defaultMessage:
      'Switch this on to write rules that decide which people and connections appear on this stage, such as only the people named as close friends. Without a filter, everyone of the chosen type is shown.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.sociogram.promptsTitle',
    defaultMessage: 'Set the tasks',
    description:
      'Title of the walkthrough step about the prompts. On a Sociogram, a prompt is one task the participant is set on the canvas.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.sociogram.promptsBody',
    defaultMessage:
      'Each prompt is one task on the canvas, such as “Place people who know each other close together”. Every prompt saves where people are put in a layout variable, and can also let the participant connect two people by tapping them, or mark people by tapping them. Add at least one.',
    description:
      'Body of the walkthrough step about the prompts. The quoted task is an example and may be translated.',
  },
  backgroundTitle: {
    id: 'protocolBuilder.walkthrough.sociogram.backgroundTitle',
    defaultMessage: 'Choose the background',
    description: 'Title of the walkthrough step about the canvas background.',
  },
  backgroundBody: {
    id: 'protocolBuilder.walkthrough.sociogram.backgroundBody',
    defaultMessage:
      'Draw concentric circles behind the canvas, or use an image of your own. Circles give the participant rings to place people in, for example closer people nearer the middle.',
    description: 'Body of the walkthrough step about the canvas background.',
  },
  layoutTitle: {
    id: 'protocolBuilder.walkthrough.sociogram.layoutTitle',
    defaultMessage: 'Choose how people are arranged',
    description: 'Title of the walkthrough step about node layout.',
  },
  layoutBody: {
    id: 'protocolBuilder.walkthrough.sociogram.layoutBody',
    defaultMessage:
      'In manual mode, people wait in a tray at the bottom of the screen until the participant drags each one onto the canvas. In automatic mode, the canvas arranges them by their connections when the stage opens.',
    description: 'Body of the walkthrough step about node layout.',
  },
});

const sociogram = (stage: Stage) => stageOfType(stage, 'Sociogram');

export const sociogramWalkthrough: StageWalkthrough = [
  introStep('Sociogram', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => sociogram(stage)?.subject?.type !== undefined,
  },
  {
    id: 'filter',
    title: messages.filterTitle,
    body: messages.filterBody,
    target: { section: networkFilterSectionTitle },
    optional: true,
  },
  {
    id: 'prompts',
    title: messages.promptsTitle,
    body: messages.promptsBody,
    target: { section: promptsSectionMessages.title },
    done: (stage) => (sociogram(stage)?.prompts?.length ?? 0) > 0,
  },
  {
    id: 'background',
    title: messages.backgroundTitle,
    body: messages.backgroundBody,
    target: { section: backgroundSectionTitle },
  },
  {
    id: 'layout',
    title: messages.layoutTitle,
    body: messages.layoutBody,
    target: { section: canvasBehavioursMessages.nodeLayoutTitle },
    optional: true,
  },
  ...closingSteps,
];
