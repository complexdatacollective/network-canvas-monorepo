import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { EDGES_FIELD } from '../../editors/network-composer/sections/ComposerConnectionsSection.tsx';
import { composerMessages } from '../../editors/network-composer/sections/composerMessages.ts';
import {
  AUTOMATIC_LAYOUT_FIELD,
  CONVEX_HULL_FIELD,
  LAYOUT_VARIABLE_FIELD,
  NODE_FORM_FIELD,
  QUICK_ADD_FIELD,
} from '../../editors/network-composer/sections/ComposerNodesSection.tsx';
import { backgroundSectionTitle } from '../../sections/background/BackgroundSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { networkComposerVisuals as visuals } from './networkComposerVisuals.ts';
import {
  guidanceStep,
  skipLogicStep,
  stageOfType,
  YES_NO,
} from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.introTitle',
    defaultMessage: 'Setting up a Network Composer stage',
    description:
      'Title of the first step of a guided walkthrough of the Network Composer stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.introBody',
    defaultMessage:
      'The Network Composer is a single canvas for building a whole network: adding people, grouping them and drawing the connections between them. It is made for an interviewer or researcher to drive, rather than for a participant working alone. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description: 'Body of the first step of the Network Composer walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.subjectTitle',
    defaultMessage: 'Choose who goes on the canvas',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.subjectBody',
    defaultMessage:
      'Pick the node type that is added on this canvas. A composer works with one node type. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  quickAddTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.quickAddTitle',
    defaultMessage: 'Choose where names are saved',
    description:
      'Title of the walkthrough step about the attribute the add-node name box fills in.',
  },
  quickAddBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.quickAddBody',
    defaultMessage:
      'The Add Node tool opens a name box, and whatever is typed in it is saved in this text variable — usually a name. Pick one, or create one here.',
    description:
      'Body of the walkthrough step about the attribute the add-node name box fills in. Add Node is the name of a tool on the canvas.',
  },
  positionsTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.positionsTitle',
    defaultMessage: 'Choose where positions are saved',
    description:
      'Title of the walkthrough step about the attribute storing where each node sits.',
  },
  positionsBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.positionsBody',
    defaultMessage:
      'Where each person sits on the canvas is saved in this layout variable. Use the same variable on other canvas stages and people stay where they were put.',
    description:
      'Body of the walkthrough step about the attribute storing where each node sits.',
  },
  layoutTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.layoutTitle',
    defaultMessage: 'Choose how the canvas starts',
    description: 'Title of the walkthrough step about automatic layout.',
  },
  layoutBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.layoutBody',
    defaultMessage:
      'With automatic layout on, the canvas arranges people by their connections. The interviewer can switch it on or off during the interview; this only sets how the stage starts.',
    description: 'Body of the walkthrough step about automatic layout.',
  },
  groupsTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.groupsTitle',
    defaultMessage: 'Let people be grouped',
    description: 'Title of the walkthrough step about group hulls.',
  },
  groupsBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.groupsBody',
    defaultMessage:
      'Pick a categorical variable to group people by, such as household. Each of its options is a group, shaded on the canvas, and the Groups tool adds people to one.',
    description:
      'Body of the walkthrough step about group hulls. Groups is the name of a tool on the canvas.',
  },
  groupsChoiceTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.groupsChoiceTitle',
    defaultMessage: 'Will people be put into groups?',
    description:
      'Title of the walkthrough step asking the researcher whether the interviewer will group people on the canvas, for example by household.',
  },
  groupsChoiceBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.groupsChoiceBody',
    defaultMessage:
      'Groups shade people who belong together, such as a household or a team. Your answer only decides which steps come next; it does not change the stage.',
    description:
      'Body of the walkthrough step asking whether the interviewer will group people on the canvas.',
  },
  nodeFormChoiceTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.nodeFormChoiceTitle',
    defaultMessage: 'Will you ask questions about each person?',
    description:
      'Title of the walkthrough step asking the researcher whether the stage asks questions about each node.',
  },
  nodeFormChoiceBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.nodeFormChoiceBody',
    defaultMessage:
      'For example, how often the participant sees them, or how close they are. Questions can also be asked on a later stage.',
    description:
      'Body of the walkthrough step asking whether the stage asks questions about each node.',
  },
  edgesChoiceTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.edgesChoiceTitle',
    defaultMessage: 'Will connections be drawn between people?',
    description:
      'Title of the walkthrough step asking the researcher whether the interviewer will draw connections between nodes on this stage.',
  },
  edgesChoiceBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.edgesChoiceBody',
    defaultMessage:
      'Connections record a relationship between two people, such as who knows whom.',
    description:
      'Body of the walkthrough step asking whether the interviewer will draw connections between nodes.',
  },
  nodeFormTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.nodeFormTitle',
    defaultMessage: 'Ask about each person',
    description:
      'Title of the walkthrough step about the questions asked about each node.',
  },
  nodeFormBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.nodeFormBody',
    defaultMessage:
      'Switch this on and add a question. Questions appear in the side panel when a person on the canvas is selected. Each pairs a variable with the control used to answer it, and the control is chosen here, on the stage.',
    description:
      'Body of the walkthrough step about the questions asked about each node.',
  },
  edgesTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.edgesTitle',
    defaultMessage: 'Choose the connections that can be drawn',
    description: 'Title of the walkthrough step about connection types.',
  },
  edgesBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.edgesBody',
    defaultMessage:
      'Add each type of connection the Draw Edge tool can create, such as friendship or work. Each type can be added once, and its label is what the interviewer picks from the Draw Edge menu.',
    description:
      'Body of the walkthrough step about connection types. Draw Edge is the name of a tool on the canvas.',
  },
  edgeFormTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.edgeFormTitle',
    defaultMessage: 'Ask about each connection',
    description:
      'Title of the walkthrough step about the questions asked about each connection.',
  },
  edgeFormBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.edgeFormBody',
    defaultMessage:
      'Each connection type can have its own questions, shown in the side panel when one of its connections is selected.',
    description:
      'Body of the walkthrough step about the questions asked about each connection.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about customizing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.wordingBody',
    defaultMessage:
      'Network Canvas supplies the words on the canvas, such as the name box hint and the tool tooltips. They are shared by every Network Composer stage in the protocol, so a change here applies to all of them.',
    description:
      'Body of the walkthrough step about customizing the wording Network Canvas supplies for the stage.',
  },
  backgroundTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.backgroundTitle',
    defaultMessage: 'Choose the background',
    description: 'Title of the walkthrough step about the canvas background.',
  },
  backgroundBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.backgroundBody',
    defaultMessage:
      'Draw concentric circles behind the canvas, or use an image of your own. Circles can help the interviewer place people, for example closer people nearer the middle.',
    description: 'Body of the walkthrough step about the canvas background.',
  },
  finishTitle: {
    id: 'protocolBuilder.walkthrough.networkComposer.finishTitle',
    defaultMessage: 'Try it out',
    description: 'Title of the last step of the Network Composer walkthrough.',
  },
  finishBody: {
    id: 'protocolBuilder.walkthrough.networkComposer.finishBody',
    defaultMessage:
      'Below is what the stage has so far; pick a step to go back to it. Then use **Preview** to build a small network as an interviewer would.',
    description:
      'Body of the last step of the Network Composer walkthrough. Markdown; Preview is the label of the button that opens a preview of the stage.',
  },
});

const composer = (stage: Stage) => stageOfType(stage, 'NetworkComposer');

/**
 * The Network Composer editor, one step per setting, in the order the editor
 * shows them. Three questions skip the settings a stage will not use.
 */
export const networkComposerWalkthrough: StageWalkthrough = [
  {
    id: 'intro',
    title: messages.introTitle,
    body: messages.introBody,
    visual: visuals.canvas,
  },
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => composer(stage)?.subject?.type !== undefined,
  },
  {
    id: 'quickAdd',
    visual: visuals.quickAdd,
    title: messages.quickAddTitle,
    body: messages.quickAddBody,
    target: { section: composerMessages.nodesTitle, field: QUICK_ADD_FIELD },
    done: (stage) => composer(stage)?.quickAdd !== undefined,
  },
  {
    id: 'positions',
    title: messages.positionsTitle,
    body: messages.positionsBody,
    target: {
      section: composerMessages.nodesTitle,
      field: LAYOUT_VARIABLE_FIELD,
    },
    done: (stage) => composer(stage)?.layoutVariable !== undefined,
  },
  {
    id: 'layout',
    visual: visuals.automaticLayout,
    title: messages.layoutTitle,
    body: messages.layoutBody,
    target: {
      section: composerMessages.nodesTitle,
      field: AUTOMATIC_LAYOUT_FIELD,
    },
    optional: true,
  },
  {
    id: 'groupsChoice',
    visual: visuals.groups,
    title: messages.groupsChoiceTitle,
    body: messages.groupsChoiceBody,
    target: { section: composerMessages.nodesTitle, field: CONVEX_HULL_FIELD },
    choose: { id: 'groups', options: YES_NO },
  },
  {
    id: 'groups',
    visual: visuals.groups,
    title: messages.groupsTitle,
    body: messages.groupsBody,
    target: { section: composerMessages.nodesTitle, field: CONVEX_HULL_FIELD },
    when: { groups: 'yes' },
    done: (stage) => composer(stage)?.convexHullVariable !== undefined,
  },
  {
    id: 'nodeFormChoice',
    visual: visuals.nodeForm,
    title: messages.nodeFormChoiceTitle,
    body: messages.nodeFormChoiceBody,
    target: { section: composerMessages.nodeFormTitle },
    choose: { id: 'nodeForm', options: YES_NO },
  },
  {
    id: 'nodeForm',
    visual: visuals.nodeForm,
    title: messages.nodeFormTitle,
    body: messages.nodeFormBody,
    target: { section: composerMessages.nodeFormTitle, field: NODE_FORM_FIELD },
    when: { nodeForm: 'yes' },
    done: (stage) => (composer(stage)?.nodeForm?.fields?.length ?? 0) > 0,
  },
  {
    id: 'edgesChoice',
    visual: visuals.connections,
    title: messages.edgesChoiceTitle,
    body: messages.edgesChoiceBody,
    target: { section: composerMessages.connectionsTitle },
    choose: { id: 'edges', options: YES_NO },
  },
  {
    id: 'edges',
    visual: visuals.drawConnection,
    title: messages.edgesTitle,
    body: messages.edgesBody,
    target: { section: composerMessages.connectionsTitle, field: EDGES_FIELD },
    when: { edges: 'yes' },
    done: (stage) => (composer(stage)?.edges?.length ?? 0) > 0,
  },
  {
    id: 'edgeForms',
    title: messages.edgeFormTitle,
    body: messages.edgeFormBody,
    target: { section: composerMessages.connectionFormsTitle },
    when: { edges: 'yes' },
    optional: true,
  },
  {
    id: 'wording',
    title: messages.wordingTitle,
    body: messages.wordingBody,
    target: { section: stageWordingMessages.title },
    optional: true,
  },
  {
    id: 'background',
    visual: visuals.background,
    title: messages.backgroundTitle,
    body: messages.backgroundBody,
    target: { section: backgroundSectionTitle },
  },
  skipLogicStep,
  guidanceStep,
  { id: 'finish', title: messages.finishTitle, body: messages.finishBody },
];
