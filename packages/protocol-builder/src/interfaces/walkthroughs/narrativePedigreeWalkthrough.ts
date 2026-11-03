import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { narrativePedigreeMessages } from '../../editors/narrative-pedigree/sections/narrativePedigreeMessages.ts';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.introTitle',
    defaultMessage: 'Setting up a Narrative Pedigree stage',
    description:
      'Title of the first step of a guided walkthrough of the Narrative Pedigree stage editor. A stage is one step of an interview; a pedigree is a family tree.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.introBody',
    defaultMessage:
      'This stage shows the family a participant drew on an earlier Family Pedigree stage, marked with the conditions recorded about each person. It asks no new questions: the family is there to explore and talk through. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the Narrative Pedigree walkthrough. Family Pedigree is the name of another stage type.',
  },
  sourceTitle: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.sourceTitle',
    defaultMessage: 'Choose the family to show',
    description:
      'Title of the walkthrough step about which Family Pedigree stage this stage reads its family from.',
  },
  sourceBody: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.sourceBody',
    defaultMessage:
      'Pick the Family Pedigree stage whose family is shown here. It has to come earlier in the interview. Choosing a different one later removes the diseases set up below.',
    description:
      'Body of the walkthrough step about which Family Pedigree stage this stage reads its family from.',
  },
  diseasesTitle: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.diseasesTitle',
    defaultMessage: 'Add the diseases to show',
    description:
      'Title of the walkthrough step about the conditions drawn onto the family tree.',
  },
  diseasesBody: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.diseasesBody',
    defaultMessage:
      'Each disease marks the people who have it, read from an attribute recorded about them, usually a question asked on the Family Pedigree stage. Give each a name, a shade and an inheritance pattern. Add at least one.',
    description:
      'Body of the walkthrough step about the conditions drawn onto the family tree. An attribute is something recorded about each person; the inheritance pattern is how the condition passes through a family.',
  },
  atRiskTitle: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.atRiskTitle',
    defaultMessage: 'Show who may be at risk',
    description:
      'Title of the walkthrough step about showing people who might develop or carry a condition.',
  },
  atRiskBody: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.atRiskBody',
    defaultMessage:
      'Switch this on to also mark people who may develop or carry a disease, worked out from the family and each inheritance pattern. They are drawn with a question mark. Left off, only people recorded as having a disease are marked.',
    description:
      'Body of the walkthrough step about showing people who might develop or carry a condition.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.narrativePedigree.wordingBody',
    defaultMessage:
      'Network Canvas supplies the words on this stage, such as the button that saves a printable snapshot, and the disease picker. Switch this on only if you want different words.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage. A snapshot is a saved picture of the family tree.',
  },
});

const narrative = (stage: Stage) => stageOfType(stage, 'NarrativePedigree');

/**
 * The Narrative Pedigree editor, one step per section, in the order the editor
 * shows them. The source and at least one disease are required.
 */
export const narrativePedigreeWalkthrough: StageWalkthrough = [
  introStep('NarrativePedigree', messages.introTitle, messages.introBody),
  {
    id: 'source',
    title: messages.sourceTitle,
    body: messages.sourceBody,
    target: { section: narrativePedigreeMessages.sourceTitle },
    done: (stage) => (narrative(stage)?.sourceStageId ?? '') !== '',
  },
  {
    id: 'diseases',
    title: messages.diseasesTitle,
    body: messages.diseasesBody,
    target: { section: narrativePedigreeMessages.diseasesTitle },
    done: (stage) => (narrative(stage)?.diseases?.length ?? 0) > 0,
  },
  {
    id: 'atRisk',
    title: messages.atRiskTitle,
    body: messages.atRiskBody,
    target: { section: narrativePedigreeMessages.atRiskTitle },
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
