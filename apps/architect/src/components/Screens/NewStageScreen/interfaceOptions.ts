import {
  createAppIntl,
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { interfaceDisplayName } from '@codaco/protocol-builder/interfaces/interfaceNames';
import type { StageType } from '@codaco/protocol-validation';
const descriptionMessages = defineMessages({
  NameGenerator: {
    id: 'architect.interface.description.NameGenerator',
    defaultMessage:
      'A name generator interface which provides a form that participants complete when creating an alter.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  NameGeneratorQuickAdd: {
    id: 'architect.interface.description.NameGeneratorQuickAdd',
    defaultMessage:
      'A name generator interface designed for low response-burden. Only requires a label in order to create an alter.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  NameGeneratorRoster: {
    id: 'architect.interface.description.NameGeneratorRoster',
    defaultMessage:
      'A name generator specifically for roster data, allowing sorting and filtering of the roster.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  FamilyPedigree: {
    id: 'architect.interface.description.FamilyPedigree',
    defaultMessage:
      'An interface for collecting family pedigrees, allowing for the capture of complex family relationships and attributes as well as hereditary disease information.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  NarrativePedigree: {
    id: 'architect.interface.description.NarrativePedigree',
    defaultMessage:
      'A read-only visualisation interface that overlays disease status and inheritance patterns onto a family pedigree collected by a Family Pedigree stage.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  DyadCensus: {
    id: 'architect.interface.description.DyadCensus',
    defaultMessage:
      'A name interpreter interface that creates edges by systematically surveying all alters in the interview network.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  OneToManyDyadCensus: {
    id: 'architect.interface.description.OneToManyDyadCensus',
    defaultMessage:
      'A name interpreter interface that creates edges by systematically surveying one alter against many others in the interview network.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  TieStrengthCensus: {
    id: 'architect.interface.description.TieStrengthCensus',
    defaultMessage:
      'Combines a dyad census with an ordinal attribute to simultaneously capture the strength of ties between alters.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  Sociogram: {
    id: 'architect.interface.description.Sociogram',
    defaultMessage:
      'Designed for spatially arranging alters (either manually or automatically), creating edges between them, and highlighting the presence of alter attributes.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  NetworkComposer: {
    id: 'architect.interface.description.NetworkComposer',
    defaultMessage:
      'A free-form, single-screen canvas for building a whole network — create nodes, draw multiple edge types, and capture node and edge attributes in one place.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  Narrative: {
    id: 'architect.interface.description.Narrative',
    defaultMessage:
      'A qualitative interface that uses "presets" to switch between different views of the data in the network.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  OrdinalBin: {
    id: 'architect.interface.description.OrdinalBin',
    defaultMessage:
      'A name interpreter interface that captures ordinal data by allowing the participant to drag and drop alters into bins.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  CategoricalBin: {
    id: 'architect.interface.description.CategoricalBin',
    defaultMessage:
      'A name interpreter interface that collects nominal data by allowing the participant to drag and drop alters into circles representing a category.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  AlterForm: {
    id: 'architect.interface.description.AlterForm',
    defaultMessage:
      'An interface that allows the participant to fill out a form for each alter in the interview network.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  Geospatial: {
    id: 'architect.interface.description.Geospatial',
    defaultMessage:
      'An interface that captures geospatial data by allowing the user to select items on a map',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  AlterEdgeForm: {
    id: 'architect.interface.description.AlterEdgeForm',
    defaultMessage:
      'An edge interpreter interface that captures attribute data via a form.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  EgoForm: {
    id: 'architect.interface.description.EgoForm',
    defaultMessage:
      'An interface that collects data on your participant (ego).',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  Information: {
    id: 'architect.interface.description.Information',
    defaultMessage:
      'A general purpose screen that can be used to present information to participants using a variety of text and media resources.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
  Anonymisation: {
    id: 'architect.interface.description.Anonymisation',
    defaultMessage:
      'An interface that allows the participant to set a passphrase for node anonymisation.',
    description:
      'Description of the interview interface in the New Stage chooser.',
  },
});

const CATEGORIES = {
  GENERATORS: 'Name and Edge Generators',
  SOCIOGRAMS: 'Sociograms',
  INTERPRETERS: 'Name and Edge Interpreters',
  UTILITIES: 'Utilities',
} as const;

export const TAGS = {
  CREATE_NODES: 'Create nodes',
  CREATE_EDGES: 'Create edges',
  EGO_DATA: 'Capture Ego data',
  NODE_ATTRIBUTES: 'Capture Node Attributes',
  EDGE_ATTRIBUTES: 'Capture Edge Attributes',
  ROSTER_DATA: 'Use Roster Data',
  SHOW_MEDIA: 'Display Media',
  PROVIDE_INFORMATION: 'Display Data',
} as const;
const tagMessages = defineMessages({
  [TAGS.CREATE_NODES]: {
    id: 'architect.interface.capability.createNodes',
    defaultMessage: 'Create nodes',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.CREATE_EDGES]: {
    id: 'architect.interface.capability.createEdges',
    defaultMessage: 'Create edges',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.EGO_DATA]: {
    id: 'architect.interface.capability.egoData',
    defaultMessage: 'Capture Ego data',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.NODE_ATTRIBUTES]: {
    id: 'architect.interface.capability.nodeAttributes',
    defaultMessage: 'Capture Node Attributes',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.EDGE_ATTRIBUTES]: {
    id: 'architect.interface.capability.edgeAttributes',
    defaultMessage: 'Capture Edge Attributes',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.ROSTER_DATA]: {
    id: 'architect.interface.capability.rosterData',
    defaultMessage: 'Use Roster Data',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.SHOW_MEDIA]: {
    id: 'architect.interface.capability.showMedia',
    defaultMessage: 'Display Media',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
  [TAGS.PROVIDE_INFORMATION]: {
    id: 'architect.interface.capability.provideInformation',
    defaultMessage: 'Display Data',
    description:
      'Capability filter and badge on an interface card; the value remains a stable internal key.',
  },
});

export const interfaceTagLabel = (tag: string, intl: IntlShape): string => {
  const descriptor: MessageDescriptor | undefined = Object.hasOwn(
    tagMessages,
    tag,
  )
    ? tagMessages[tag as Tag]
    : undefined;
  return descriptor ? intl.formatMessage(descriptor) : tag;
};

export const TAG_COLORS = {
  [TAGS.CREATE_NODES]: 'neon-coral',
  [TAGS.CREATE_EDGES]: 'mustard',
  [TAGS.EGO_DATA]: 'sea-green',
  [TAGS.NODE_ATTRIBUTES]: 'cerulean-blue',
  [TAGS.EDGE_ATTRIBUTES]: 'purple-pizazz',
  [TAGS.ROSTER_DATA]: 'paradise-pink',
  [TAGS.SHOW_MEDIA]: 'neon-carrot',
  [TAGS.PROVIDE_INFORMATION]: 'barbie-pink',
} as const;

// Define the interface types as a const array first
const INTERFACE_TYPE_NAMES = [
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'FamilyPedigree',
  'NarrativePedigree',
  'DyadCensus',
  'OneToManyDyadCensus',
  'TieStrengthCensus',
  'Sociogram',
  'NetworkComposer',
  'Narrative',
  'OrdinalBin',
  'CategoricalBin',
  'AlterForm',
  'Geospatial',
  'AlterEdgeForm',
  'EgoForm',
  'Information',
  'Anonymisation',
] as const;

// Type helpers
type InterfaceTypeName = (typeof INTERFACE_TYPE_NAMES)[number];
type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];
type Tag = (typeof TAGS)[keyof typeof TAGS];

export type InterfaceType = {
  type: InterfaceTypeName;
  tags: Tag[];
  category: Category;
  title: string;
  keywords: string;
  description: string;
};

/**
 * Everything about an interface EXCEPT what it is called. The title is not
 * written here: it is the same researcher-facing name the stage timeline
 * announces, so both read it from `@codaco/protocol-builder`. Held apart, the
 * two drifted for six interfaces.
 */
type InterfaceDefinition = Omit<InterfaceType, 'title' | 'description'> & {
  description: MessageDescriptor;
};

const INTERFACE_DEFINITIONS: InterfaceDefinition[] = [
  {
    category: CATEGORIES.GENERATORS,
    tags: [TAGS.CREATE_NODES, TAGS.NODE_ATTRIBUTES, TAGS.ROSTER_DATA],
    keywords: 'namegenerator name generator form attributes nodes node roster',
    type: 'NameGenerator',
    description: descriptionMessages.NameGenerator,
  },
  {
    category: CATEGORIES.GENERATORS,
    tags: [TAGS.CREATE_NODES, TAGS.ROSTER_DATA],
    keywords:
      'namegenerator name generator quick add simple easy nodes node create roster',
    type: 'NameGeneratorQuickAdd',
    description: descriptionMessages.NameGeneratorQuickAdd,
  },
  {
    category: CATEGORIES.GENERATORS,
    tags: [TAGS.CREATE_NODES, TAGS.ROSTER_DATA],
    keywords:
      'namegenerator name generator search add import list filter roster nodes node csv create',
    type: 'NameGeneratorRoster',
    description: descriptionMessages.NameGeneratorRoster,
  },
  {
    category: CATEGORIES.GENERATORS,
    // Captures node attributes (sex, form fields, nomination flags) and edge
    // attributes (relationship type, active status, carrier/gamete roles).
    tags: [
      TAGS.CREATE_NODES,
      TAGS.CREATE_EDGES,
      TAGS.NODE_ATTRIBUTES,
      TAGS.EDGE_ATTRIBUTES,
    ],
    keywords:
      'family pedigree tree census namegenerator name generator nodes node edges edge',
    type: 'FamilyPedigree',
    description: descriptionMessages.FamilyPedigree,
  },
  {
    category: CATEGORIES.SOCIOGRAMS,
    // Read-only visualisation: displays data, captures nothing.
    tags: [TAGS.PROVIDE_INFORMATION],
    keywords:
      'narrative pedigree disease visualize visualise genetics inheritance focal hereditary',
    type: 'NarrativePedigree',
    description: descriptionMessages.NarrativePedigree,
  },
  {
    category: CATEGORIES.GENERATORS,
    tags: [TAGS.CREATE_EDGES],
    keywords: 'edge tie generator edges create add',
    type: 'DyadCensus',
    description: descriptionMessages.DyadCensus,
  },
  {
    category: CATEGORIES.GENERATORS,
    tags: [TAGS.CREATE_EDGES],
    keywords: 'edge tie generator edges create add',
    type: 'OneToManyDyadCensus',
    description: descriptionMessages.OneToManyDyadCensus,
  },
  {
    category: CATEGORIES.GENERATORS,
    tags: [TAGS.CREATE_EDGES, TAGS.EDGE_ATTRIBUTES],
    keywords: 'edge tie generator census dyad edges create strength ordinal',
    type: 'TieStrengthCensus',
    description: descriptionMessages.TieStrengthCensus,
  },
  {
    category: CATEGORIES.SOCIOGRAMS,
    tags: [TAGS.CREATE_EDGES, TAGS.NODE_ATTRIBUTES, TAGS.SHOW_MEDIA],
    keywords: 'sociogram visual edges highlight visualize visualise',
    type: 'Sociogram',
    description: descriptionMessages.Sociogram,
  },
  {
    category: CATEGORIES.SOCIOGRAMS,
    tags: [
      TAGS.CREATE_NODES,
      TAGS.CREATE_EDGES,
      TAGS.NODE_ATTRIBUTES,
      TAGS.EDGE_ATTRIBUTES,
    ],
    keywords:
      'network composer sociogram free form notepad build construct nodes edges attributes single screen',
    type: 'NetworkComposer',
    description: descriptionMessages.NetworkComposer,
  },
  {
    category: CATEGORIES.SOCIOGRAMS,
    tags: [TAGS.PROVIDE_INFORMATION, TAGS.SHOW_MEDIA],
    keywords:
      'sociogram narrative visual visualize highlight community qualitative',
    type: 'Narrative',
    description: descriptionMessages.Narrative,
  },
  {
    category: CATEGORIES.INTERPRETERS,
    tags: [TAGS.NODE_ATTRIBUTES],
    keywords: 'ordinal bin node attributes categorical name interpreter',
    type: 'OrdinalBin',
    description: descriptionMessages.OrdinalBin,
  },
  {
    category: CATEGORIES.INTERPRETERS,
    tags: [TAGS.NODE_ATTRIBUTES],
    keywords: 'categorical bin node attributes name interpreter',
    type: 'CategoricalBin',
    description: descriptionMessages.CategoricalBin,
  },
  {
    category: CATEGORIES.INTERPRETERS,
    tags: [TAGS.NODE_ATTRIBUTES],
    keywords: 'alter attributes node interpreter form forms',
    type: 'AlterForm',
    description: descriptionMessages.AlterForm,
  },
  {
    category: CATEGORIES.INTERPRETERS,
    tags: [TAGS.NODE_ATTRIBUTES],
    keywords: 'alter attributes node interpreter map',
    type: 'Geospatial',
    description: descriptionMessages.Geospatial,
  },
  {
    category: CATEGORIES.INTERPRETERS,
    tags: [TAGS.EDGE_ATTRIBUTES],
    keywords: 'edge attributes form forms edge interpreter',
    type: 'AlterEdgeForm',
    description: descriptionMessages.AlterEdgeForm,
  },
  {
    category: CATEGORIES.INTERPRETERS,
    tags: [TAGS.EGO_DATA],
    keywords: 'ego survey participant form forms',
    type: 'EgoForm',
    description: descriptionMessages.EgoForm,
  },
  {
    category: CATEGORIES.UTILITIES,
    tags: [TAGS.SHOW_MEDIA, TAGS.PROVIDE_INFORMATION],
    keywords:
      'instruction text participant guide intro image video audio media resource',
    type: 'Information',
    description: descriptionMessages.Information,
  },
  {
    category: CATEGORIES.UTILITIES,
    tags: [TAGS.NODE_ATTRIBUTES],
    keywords:
      'instruction text participant guide intro image video audio media resource',
    type: 'Anonymisation',
    description: descriptionMessages.Anonymisation,
  },
];

/**
 * The interfaces the New Stage screen offers, each carrying the one name this
 * app uses for it. `InterfaceTypeName` is a subset of the schema's `StageType`
 * — TypeScript rejects this lookup if one ever names a stage the schema does
 * not — so a new interface cannot reach this list without also being named.
 */
const defaultIntl = createAppIntl({ locale: 'en' });
export const getInterfaceTypes = (
  intl: IntlShape = defaultIntl,
): InterfaceType[] =>
  INTERFACE_DEFINITIONS.map((definition) => ({
    ...definition,
    title:
      interfaceDisplayName(definition.type satisfies StageType, intl) ??
      definition.type,
    description: intl.formatMessage(definition.description),
    keywords: `${definition.keywords} ${definition.tags.map((tag) => interfaceTagLabel(tag, intl)).join(' ')}`,
  }));
