import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { canvasPermissionsSectionTitle } from '../../editors/narrative/sections/permissions/CanvasPermissionsSection.tsx';
import { narrativePresetMessages } from '../../editors/narrative/sections/presets/narrativePresetMessages.ts';
import { backgroundSectionTitle } from '../../sections/background/BackgroundSection.tsx';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.narrative.introTitle',
    defaultMessage: 'Setting up a Narrative stage',
    description:
      'Title of the first step of a guided walkthrough of the Narrative stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.narrative.introBody',
    defaultMessage:
      'A Narrative stage shows the participant the network they have already built, so they can talk about it. Nothing new is collected: the canvas switches between saved views of the network while the participant tells its story. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description: 'Body of the first step of the Narrative walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.narrative.subjectTitle',
    defaultMessage: 'Choose who goes on the canvas',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.narrative.subjectBody',
    defaultMessage:
      'Pick the node type shown on the canvas. Everyone of that type named earlier in the interview appears here. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.narrative.filterTitle',
    defaultMessage: 'Show only some people',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.narrative.filterBody',
    defaultMessage:
      'Switch this on to write rules that decide which people and connections appear on this stage, such as only the people named as close friends. Without a filter, everyone of the chosen type is shown.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  presetsTitle: {
    id: 'protocolBuilder.walkthrough.narrative.presetsTitle',
    defaultMessage: 'Create the views',
    description:
      'Title of the walkthrough step about presets: saved views of the network that can be switched between during the interview.',
  },
  presetsBody: {
    id: 'protocolBuilder.walkthrough.narrative.presetsBody',
    defaultMessage:
      'Each preset is one view of the network that can be picked during the interview. It places people by a layout variable saved on an earlier stage, and can also group people, show some types of connection, and highlight people by a true-or-false variable. Add at least one.',
    description:
      'Body of the walkthrough step about presets: saved views of the network that can be switched between during the interview.',
  },
  backgroundTitle: {
    id: 'protocolBuilder.walkthrough.narrative.backgroundTitle',
    defaultMessage: 'Choose the background',
    description: 'Title of the walkthrough step about the canvas background.',
  },
  backgroundBody: {
    id: 'protocolBuilder.walkthrough.narrative.backgroundBody',
    defaultMessage:
      'Show concentric circles behind the canvas, or use an image of your own. People are shown where they were placed on earlier stages, on top of this background.',
    description: 'Body of the walkthrough step about the canvas background.',
  },
  permissionsTitle: {
    id: 'protocolBuilder.walkthrough.narrative.permissionsTitle',
    defaultMessage: 'Choose what can be done on the canvas',
    description:
      'Title of the walkthrough step about the switches deciding what the participant may do to the canvas.',
  },
  permissionsBody: {
    id: 'protocolBuilder.walkthrough.narrative.permissionsBody',
    defaultMessage:
      'Automatic layout lets the canvas move people by their connections, starting from where they were placed. Free-draw lets the participant draw on the canvas while they talk, and repositioning lets them drag people around. None of these changes the positions saved in the interview.',
    description:
      'Body of the walkthrough step about the switches deciding what the participant may do to the canvas. Free-draw is the label of one of the switches.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.narrative.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.narrative.wordingBody',
    defaultMessage:
      'Network Canvas supplies the words on this stage, such as the headings in the key that explains what is highlighted, connected and grouped. Switch this on to write your own.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage. The key is the panel on the canvas explaining what each mark means.',
  },
});

const narrative = (stage: Stage) => stageOfType(stage, 'Narrative');

export const narrativeWalkthrough: StageWalkthrough = [
  introStep('Narrative', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => narrative(stage)?.subject?.type !== undefined,
  },
  {
    id: 'filter',
    title: messages.filterTitle,
    body: messages.filterBody,
    target: { section: networkFilterSectionTitle },
    optional: true,
  },
  {
    id: 'presets',
    title: messages.presetsTitle,
    body: messages.presetsBody,
    target: { section: narrativePresetMessages.presetsTitle },
    done: (stage) => (narrative(stage)?.presets?.length ?? 0) > 0,
  },
  {
    id: 'background',
    title: messages.backgroundTitle,
    body: messages.backgroundBody,
    target: { section: backgroundSectionTitle },
  },
  {
    id: 'permissions',
    title: messages.permissionsTitle,
    body: messages.permissionsBody,
    target: { section: canvasPermissionsSectionTitle },
    optional: true,
  },
  {
    id: 'wording',
    title: messages.wordingTitle,
    body: messages.wordingBody,
    target: { section: stageWordingMessages.title },
    optional: true,
  },
  ...closingSteps,
];
