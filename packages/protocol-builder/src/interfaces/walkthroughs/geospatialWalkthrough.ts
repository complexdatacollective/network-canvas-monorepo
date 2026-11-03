import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import {
  LAYER_FIELD,
  PROPERTY_FIELD,
} from '../../editors/geospatial/sections/mapOptionsFields.ts';
import { geospatialMessages } from '../../fields/geospatial/geospatialMessages.ts';
import { networkFilterSectionTitle } from '../../sections/network-filter/NetworkFilterSection.tsx';
import { promptsSectionMessages } from '../../sections/PromptsSection.tsx';
import { nodeSubjectSectionTitle } from '../../sections/subject-picker/SubjectSection.tsx';
import { stageWordingMessages } from '../../sections/supplied-wording/stageWordingMessages.ts';
import { closingSteps, introStep, stageOfType } from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.introTitle',
    defaultMessage: 'Setting up a Geospatial stage',
    description:
      'Title of the first step of a guided walkthrough of the Geospatial stage editor. A stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.geospatial.introBody',
    defaultMessage:
      'On this stage the participant answers each prompt by choosing an area on a map, for each person in their network. The map comes from Mapbox, drawn with a key and a file of areas that you provide. This walkthrough visits each setting in order. You can keep editing while it is open.',
    description:
      'Body of the first step of the Geospatial walkthrough. Mapbox is the name of the map provider and stays untranslated.',
  },
  subjectTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.subjectTitle',
    defaultMessage: 'Choose who is placed on the map',
    description: 'Title of the walkthrough step about the node type.',
  },
  subjectBody: {
    id: 'protocolBuilder.walkthrough.geospatial.subjectBody',
    defaultMessage:
      'Pick the node type the participant answers about. Each person of that type is shown in turn. Choosing a different type later clears the rest of the stage.',
    description:
      'Body of the walkthrough step about the node type. A node is one member of the network a participant describes.',
  },
  filterTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.filterTitle',
    defaultMessage: 'Limit who is shown',
    description: 'Title of the walkthrough step about the stage filter.',
  },
  filterBody: {
    id: 'protocolBuilder.walkthrough.geospatial.filterBody',
    defaultMessage:
      'Switch this on to show only some people of that type, chosen by rules about their answers so far. Left off, everyone of that type is shown.',
    description: 'Body of the walkthrough step about the stage filter.',
  },
  accessTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.accessTitle',
    defaultMessage: 'Add your Mapbox key',
    description:
      'Title of the walkthrough step about the Mapbox API key. Mapbox is the name of the map provider and stays untranslated.',
  },
  accessBody: {
    id: 'protocolBuilder.walkthrough.geospatial.accessBody',
    defaultMessage:
      'The map cannot be drawn without an API key from your own Mapbox account. Choose a stored key, or add one as a resource.',
    description:
      'Body of the walkthrough step about the Mapbox API key. A resource is a file or key stored with the protocol.',
  },
  layerTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.layerTitle',
    defaultMessage: 'Choose the areas to pick from',
    description:
      'Title of the walkthrough step about the GeoJSON file of areas a participant can choose on the map.',
  },
  layerBody: {
    id: 'protocolBuilder.walkthrough.geospatial.layerBody',
    defaultMessage:
      'Choose a GeoJSON file holding the areas the participant can select, such as census tracts or postal areas. They are outlined on the map.',
    description:
      'Body of the walkthrough step about the GeoJSON file of areas a participant can choose. GeoJSON is a file format and stays untranslated.',
  },
  propertyTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.propertyTitle',
    defaultMessage: 'Choose what is recorded',
    description:
      'Title of the walkthrough step about the property of a chosen area that is saved as the answer.',
  },
  propertyBody: {
    id: 'protocolBuilder.walkthrough.geospatial.propertyBody',
    defaultMessage:
      'When the participant selects an area, the value of this property is saved as their answer. Pick one that names each area, and is different for every one.',
    description:
      'Body of the walkthrough step about the property of a chosen area that is saved as the answer. A property is one named value each area in the GeoJSON file carries.',
  },
  promptsTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.promptsTitle',
    defaultMessage: 'Write the prompts',
    description: 'Title of the walkthrough step about the stage prompts.',
  },
  promptsBody: {
    id: 'protocolBuilder.walkthrough.geospatial.promptsBody',
    defaultMessage:
      'Each prompt is a question, such as “Where does this person live?”, answered by selecting an area. Pick the variable each answer is saved in. Add at least one.',
    description:
      'Body of the walkthrough step about the stage prompts. A variable is where an answer is stored about each person.',
  },
  appearanceTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.appearanceTitle',
    defaultMessage: 'Choose how the map looks',
    description:
      'Title of the walkthrough step about the map style, highlight and extra map features.',
  },
  appearanceBody: {
    id: 'protocolBuilder.walkthrough.geospatial.appearanceBody',
    defaultMessage:
      'Pick the map style drawn under the areas, and the shade used to outline them and mark the one selected. You can also show public transit, or let the participant search for a place.',
    description:
      'Body of the walkthrough step about the map style, highlight and extra map features.',
  },
  viewTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.viewTitle',
    defaultMessage: 'Choose where the map opens',
    description:
      'Title of the walkthrough step about the starting position and zoom of the map.',
  },
  viewBody: {
    id: 'protocolBuilder.walkthrough.geospatial.viewBody',
    defaultMessage:
      'Set the place and zoom level the map shows when the stage opens. Move the map to the study area, then accept that view.',
    description:
      'Body of the walkthrough step about the starting position and zoom of the map.',
  },
  wordingTitle: {
    id: 'protocolBuilder.walkthrough.geospatial.wordingTitle',
    defaultMessage: 'Change the built-in wording',
    description:
      'Title of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
  wordingBody: {
    id: 'protocolBuilder.walkthrough.geospatial.wordingBody',
    defaultMessage:
      'Network Canvas supplies the words on the map, such as the button for a place outside the areas offered. Switch this on only if you want different words.',
    description:
      'Body of the walkthrough step about changing the wording Network Canvas supplies for the stage.',
  },
});

const geospatial = (stage: Stage) => stageOfType(stage, 'Geospatial');

/**
 * The Geospatial editor, one step per setting, in the order the editor shows
 * them. Every map setting but the extras is required by the schema.
 */
export const geospatialWalkthrough: StageWalkthrough = [
  introStep('Geospatial', messages.introTitle, messages.introBody),
  {
    id: 'subject',
    title: messages.subjectTitle,
    body: messages.subjectBody,
    target: { section: nodeSubjectSectionTitle },
    done: (stage) => geospatial(stage)?.subject?.type !== undefined,
  },
  {
    id: 'filter',
    title: messages.filterTitle,
    body: messages.filterBody,
    target: { section: networkFilterSectionTitle },
    optional: true,
  },
  {
    id: 'access',
    title: messages.accessTitle,
    body: messages.accessBody,
    target: { section: geospatialMessages.accessTitle },
    done: (stage) => geospatial(stage)?.mapOptions?.tokenAssetId !== undefined,
  },
  {
    id: 'layer',
    title: messages.layerTitle,
    body: messages.layerBody,
    target: { section: geospatialMessages.layerTitle, field: LAYER_FIELD },
    done: (stage) =>
      geospatial(stage)?.mapOptions?.dataSourceAssetId !== undefined,
  },
  {
    id: 'property',
    title: messages.propertyTitle,
    body: messages.propertyBody,
    target: { section: geospatialMessages.layerTitle, field: PROPERTY_FIELD },
    done: (stage) =>
      (geospatial(stage)?.mapOptions?.targetFeatureProperty ?? '') !== '',
  },
  {
    id: 'prompts',
    title: messages.promptsTitle,
    body: messages.promptsBody,
    target: { section: promptsSectionMessages.title },
    done: (stage) => (geospatial(stage)?.prompts?.length ?? 0) > 0,
  },
  {
    id: 'appearance',
    title: messages.appearanceTitle,
    body: messages.appearanceBody,
    target: { section: geospatialMessages.appearanceTitle },
    done: (stage) => {
      const options = geospatial(stage)?.mapOptions;
      return options?.style !== undefined && options.color !== undefined;
    },
  },
  {
    id: 'view',
    title: messages.viewTitle,
    body: messages.viewBody,
    target: { section: geospatialMessages.viewTitle },
    done: (stage) => {
      const options = geospatial(stage)?.mapOptions;
      return options?.center !== undefined && options.initialZoom !== undefined;
    },
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
