import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import { familyPedigreeMessages as pedigree } from '../../editors/family-pedigree/sections/pedigreeMessages.ts';
import {
  EDGE_CONFIGURATION_PATHS,
  EDGE_CONFIGURATION_TYPE_PATH,
  NODE_CONFIGURATION_PATHS,
} from '../../editors/family-pedigree/sections/pedigreeSlots.ts';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import {
  closingSteps,
  hasText,
  introStep,
  stageOfType,
  YES_NO,
} from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.introTitle',
    defaultMessage: 'Setting up a Family Pedigree stage',
    description:
      'Title of the first step of a guided walkthrough of the Family Pedigree stage editor. A stage is one step of an interview; a pedigree is a family tree.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.introBody',
    defaultMessage:
      'On this stage the participant draws their family tree, starting from themselves and adding parents, siblings, partners and children. Most settings choose where the stage records what it learns about each person and relationship. This walkthrough visits each setting in order. You can keep editing while the walkthrough is open.',
    description: 'Body of the first step of the Family Pedigree walkthrough.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.subjectTitle',
    defaultMessage: 'Choose the node type for family members',
    description:
      'Title of the walkthrough step about the node type family members are recorded as.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.subjectBody',
    defaultMessage:
      'Every person in the family, the participant included, is recorded as this node type. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type family members are recorded as. A node is one member of the network a participant describes.',
  },
  promptTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.promptTitle',
    defaultMessage: 'Write the prompt',
    description:
      'Title of the walkthrough step about the instruction shown while the participant draws their family.',
  },
  promptBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.promptBody',
    defaultMessage:
      'The participant reads this instruction while they draw their family, for example “Add the members of your family you know about.”',
    description:
      'Body of the walkthrough step about the instruction shown while the participant draws their family.',
  },
  nameTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.nameTitle',
    defaultMessage: 'Choose where names are saved',
    description:
      'Title of the walkthrough step about the attribute holding each family member’s name.',
  },
  nameBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.nameBody',
    defaultMessage:
      'The side panel asks for each new person’s name and saves it in this text attribute. Pick one, or create one. The question and its hint below start with Network Canvas’s wording, which you can change.',
    description:
      'Body of the walkthrough step about the attribute holding each family member’s name. The side panel is where each person is described.',
  },
  sexTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.sexTitle',
    defaultMessage: 'Choose where sex assigned at birth is saved',
    description:
      'Title of the walkthrough step about the attribute holding each family member’s sex assigned at birth.',
  },
  sexBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.sexBody',
    defaultMessage:
      'The side panel also asks each person’s sex assigned at birth and saves it in this attribute. Network Canvas supplies its answer options, so you do not write them.',
    description:
      'Body of the walkthrough step about the attribute holding each family member’s sex assigned at birth. The answer options of this attribute are supplied by Network Canvas, not written by the researcher.',
  },
  egoTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.egoTitle',
    defaultMessage: 'Choose how the participant is marked',
    description:
      'Title of the walkthrough step about the attribute marking which family member is the participant.',
  },
  egoBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.egoBody',
    defaultMessage:
      'The participant is a person in their own family. The stage sets this true or false attribute on them, so later stages can tell them apart from their relatives.',
    description:
      'Body of the walkthrough step about the attribute marking which family member is the participant.',
  },
  genderTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.genderTitle',
    defaultMessage: 'Ask about gender identity',
    description:
      'Title of the walkthrough step about asking each family member’s gender identity.',
  },
  genderBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.genderBody',
    defaultMessage:
      'When this is on, the side panel asks each person’s gender identity, and words such as mother or brother follow the answer. Pick the attribute and the words each answer takes. Switch it off to have those words follow sex assigned at birth instead.',
    description:
      'Body of the walkthrough step about asking each family member’s gender identity.',
  },
  symbolsTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.symbolsTitle',
    defaultMessage: 'Choose the symbols',
    description:
      'Title of the walkthrough step about the symbol (circle, square or diamond) each family member is drawn with.',
  },
  symbolsBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.symbolsBody',
    defaultMessage:
      'Each person is drawn as a circle, square or diamond. Choose whether the shape follows sex assigned at birth or gender identity. This changes the node type in the codebook straight away, so it applies on every stage that shows these people.',
    description:
      'Body of the walkthrough step about the symbol each family member is drawn with. The codebook holds the protocol’s node types and their settings.',
  },
  relationToYouTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.relationToYouTitle',
    defaultMessage: 'Record how each person is related',
    description:
      'Title of the walkthrough step about recording each family member’s relationship to the participant.',
  },
  relationToYouBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.relationToYouBody',
    defaultMessage:
      'Switch this on to save each person’s relationship to the participant, such as aunt or cousin. It is worked out from the family drawn, never asked, and later stages can filter or skip on it.',
    description:
      'Body of the walkthrough step about recording each family member’s relationship to the participant.',
  },
  edgeTypeTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.edgeTypeTitle',
    defaultMessage: 'Choose how relationships are saved',
    description:
      'Title of the walkthrough step about the edge type family relationships are recorded as.',
  },
  edgeTypeBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.edgeTypeBody',
    defaultMessage:
      'Each parent and partner connection in the family is saved as this edge type. Siblings are not saved directly: two people are siblings when they share a parent.',
    description:
      'Body of the walkthrough step about the edge type family relationships are recorded as. An edge is a connection between two people.',
  },
  edgeAttributesTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.edgeAttributesTitle',
    defaultMessage: 'Choose what is saved about each relationship',
    description:
      'Title of the walkthrough step about the attributes the stage writes on each family relationship.',
  },
  edgeAttributesBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.edgeAttributesBody',
    defaultMessage:
      'The stage saves the kind of each relationship, who carried each pregnancy, and whether partners are still together. Pick or create an attribute for each.',
    description:
      'Body of the walkthrough step about the attributes the stage writes on each family relationship.',
  },
  framingTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.framingTitle',
    defaultMessage: 'Choose the family words',
    description:
      'Title of the walkthrough step about the words used for unnamed family members, such as mother or egg parent.',
  },
  framingBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.framingBody',
    defaultMessage:
      'People the participant has not named yet are called by a family word. Choose everyday words such as mother and father, egg and sperm parent words, or let the participant choose. This changes only what participants read.',
    description:
      'Body of the walkthrough step about the words used for unnamed family members.',
  },
  personFormTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.personFormTitle',
    defaultMessage: 'Ask more about each person',
    description:
      'Title of the walkthrough step about extra questions asked about each family member.',
  },
  personFormBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.personFormBody',
    defaultMessage:
      'Switch this on to add your own questions to the side panel, such as year of birth. They come after the stage’s own questions about each person.',
    description:
      'Body of the walkthrough step about extra questions asked about each family member.',
  },
  completenessChoiceTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.completenessChoiceTitle',
    defaultMessage:
      'Should participants have to record a minimum set of relatives?',
    description:
      'Title of the walkthrough step asking the researcher whether the stage checks that enough of the family has been drawn before the participant continues.',
  },
  completenessChoiceBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.completenessChoiceBody',
    defaultMessage:
      'For example, both parents and every sibling. Without a check, the participant can continue with whatever they have drawn. Your answer only decides which steps come next; it does not change the stage.',
    description:
      'Body of the walkthrough step asking whether the stage checks that enough of the family has been drawn.',
  },
  completenessTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.completenessTitle',
    defaultMessage: 'Set what must be recorded',
    description:
      'Title of the walkthrough step about how much of the family must be drawn.',
  },
  completenessBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.completenessBody',
    defaultMessage:
      'Switch this on and choose which relatives the family should include, and whether that is required or only recommended. A checklist shows the participant what is missing. Pick an attribute to store answers such as “no siblings”.',
    description:
      'Body of the walkthrough step about how much of the family must be drawn.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.wordingBody',
    defaultMessage:
      'Network Canvas supplies every word the participant reads while drawing, such as the side panel questions and the checklist. Switch this on only if you want different words.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  nominationChoiceTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.nominationChoiceTitle',
    defaultMessage: 'Will you ask about the whole family?',
    description:
      'Title of the walkthrough step asking the researcher whether the stage asks questions about the whole family once it is drawn.',
  },
  nominationChoiceBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.nominationChoiceBody',
    defaultMessage:
      'For example, “Who in your family has had heart disease?”. A Narrative Pedigree stage can later show the answers on the family tree.',
    description:
      'Body of the walkthrough step asking whether the stage asks questions about the whole family. Narrative Pedigree is the name of another stage type.',
  },
  nominationTitle: {
    id: 'protocolBuilder.walkthrough.familyPedigree.nominationTitle',
    defaultMessage: 'Write the family questions',
    description:
      'Title of the walkthrough step about the questions asked about the whole family.',
  },
  nominationBody: {
    id: 'protocolBuilder.walkthrough.familyPedigree.nominationBody',
    defaultMessage:
      'Switch this on and add a prompt for each question. Once the family is drawn, the participant answers each in turn by selecting everyone it applies to, which sets a true or false attribute on them.',
    description:
      'Body of the walkthrough step about the questions asked about the whole family.',
  },
});

const familyPedigree = (stage: Stage) => stageOfType(stage, 'FamilyPedigree');

/**
 * The Family Pedigree editor, one step per setting, in the order the editor
 * shows them. Two questions skip the completeness check and the family
 * questions when a stage will not use them.
 */
export const familyPedigreeWalkthrough: StageWalkthrough = [
  introStep('FamilyPedigree', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => familyPedigree(stage)?.subject?.type !== undefined,
  },
  {
    id: 'prompt',
    title: messages.promptTitle,
    body: messages.promptBody,
    target: { section: pedigree.promptTitle },
    done: (stage) => hasText(familyPedigree(stage)?.prompt),
  },
  {
    id: 'name',
    title: messages.nameTitle,
    body: messages.nameBody,
    target: {
      section: pedigree.nodeConfigurationTitle,
      field: NODE_CONFIGURATION_PATHS.nameAttribute,
    },
    done: (stage) =>
      familyPedigree(stage)?.nodeConfiguration?.nameAttribute !== undefined,
  },
  {
    id: 'sexAssignedAtBirth',
    title: messages.sexTitle,
    body: messages.sexBody,
    target: {
      section: pedigree.nodeConfigurationTitle,
      field: NODE_CONFIGURATION_PATHS.sexAssignedAtBirthAttribute,
    },
    done: (stage) =>
      familyPedigree(stage)?.nodeConfiguration?.sexAssignedAtBirthAttribute !==
      undefined,
  },
  {
    id: 'participantMarker',
    title: messages.egoTitle,
    body: messages.egoBody,
    target: {
      section: pedigree.nodeConfigurationTitle,
      field: NODE_CONFIGURATION_PATHS.egoAttribute,
    },
    done: (stage) =>
      familyPedigree(stage)?.nodeConfiguration?.egoAttribute !== undefined,
  },
  {
    id: 'symbols',
    title: messages.symbolsTitle,
    body: messages.symbolsBody,
    target: {
      section: pedigree.nodeConfigurationTitle,
      field: 'pedigree-symbols',
    },
    optional: true,
  },
  {
    id: 'genderIdentity',
    title: messages.genderTitle,
    body: messages.genderBody,
    target: { section: pedigree.genderIdentityTitle },
    optional: true,
  },
  {
    id: 'relationshipToParticipant',
    title: messages.relationToYouTitle,
    body: messages.relationToYouBody,
    target: { section: pedigree.relationshipToParticipantTitle },
    optional: true,
  },
  {
    id: 'edgeType',
    title: messages.edgeTypeTitle,
    body: messages.edgeTypeBody,
    target: {
      section: pedigree.relationshipsTitle,
      field: EDGE_CONFIGURATION_TYPE_PATH,
    },
    done: (stage) =>
      familyPedigree(stage)?.edgeConfiguration?.type !== undefined,
  },
  {
    id: 'edgeAttributes',
    title: messages.edgeAttributesTitle,
    body: messages.edgeAttributesBody,
    target: {
      section: pedigree.relationshipsTitle,
      field: EDGE_CONFIGURATION_PATHS.kindAttribute,
    },
    done: (stage) => {
      const edges = familyPedigree(stage)?.edgeConfiguration;
      return (
        edges?.kindAttribute !== undefined &&
        edges.gestationalCarrierAttribute !== undefined &&
        edges.currentPartnerAttribute !== undefined
      );
    },
  },
  {
    id: 'framing',
    title: messages.framingTitle,
    body: messages.framingBody,
    target: { section: pedigree.framingTitle },
    optional: true,
  },
  {
    id: 'personForm',
    title: messages.personFormTitle,
    body: messages.personFormBody,
    target: { section: pedigree.personFormTitle },
    optional: true,
  },
  {
    id: 'completenessChoice',
    title: messages.completenessChoiceTitle,
    body: messages.completenessChoiceBody,
    target: { section: pedigree.completenessTitle },
    choose: { id: 'completeness', options: YES_NO },
  },
  {
    id: 'completeness',
    title: messages.completenessTitle,
    body: messages.completenessBody,
    target: { section: pedigree.completenessTitle },
    when: { completeness: 'yes' },
    done: (stage) =>
      familyPedigree(stage)?.completeness?.relativesNotRecordedAttribute !==
      undefined,
  },
  {
    id: 'wording',
    title: messages.wordingTitle,
    body: messages.wordingBody,
    target: { section: stageWordingMessages.title },
    optional: true,
  },
  {
    id: 'nominationChoice',
    title: messages.nominationChoiceTitle,
    body: messages.nominationChoiceBody,
    target: { section: pedigree.nominationTitle },
    choose: { id: 'nominations', options: YES_NO },
  },
  {
    id: 'nominations',
    title: messages.nominationTitle,
    body: messages.nominationBody,
    target: { section: pedigree.nominationTitle },
    when: { nominations: 'yes' },
    done: (stage) =>
      (familyPedigree(stage)?.nominationPrompts?.length ?? 0) > 0,
  },
  ...closingSteps,
];
