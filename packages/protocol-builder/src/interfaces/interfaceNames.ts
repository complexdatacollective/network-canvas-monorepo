import { createAppIntl, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { StageType } from '@codaco/protocol-validation';

/** Researcher-facing interface names. Keys remain the protocol's stable stage types. */
export const interfaceNameMessages = defineMessages({
  AlterEdgeForm: {
    id: 'protocolBuilder.interface.alterEdgeForm',
    defaultMessage: 'Per Alter Edge Form',
    description:
      'Researcher-facing interface name. Form for reporting relationships for each network member. Not a protocol-authored stage label.',
  },
  AlterForm: {
    id: 'protocolBuilder.interface.alterForm',
    defaultMessage: 'Per Alter Form',
    description:
      'Researcher-facing interface name. Form for reporting attributes for each network member. Not a protocol-authored stage label.',
  },
  Anonymisation: {
    id: 'protocolBuilder.interface.anonymisation',
    defaultMessage: 'Anonymisation Interface',
    description:
      'Researcher-facing interface name. Interface that anonymizes network members. Not a protocol-authored stage label.',
  },
  CategoricalBin: {
    id: 'protocolBuilder.interface.categoricalBin',
    defaultMessage: 'Categorical Bin',
    description:
      'Researcher-facing interface name. Interface that places network members into categories. Not a protocol-authored stage label.',
  },
  DyadCensus: {
    id: 'protocolBuilder.interface.dyadCensus',
    defaultMessage: 'Dyad Census',
    description:
      'Researcher-facing interface name. Interface that asks about every pair of network members. Not a protocol-authored stage label.',
  },
  EgoForm: {
    id: 'protocolBuilder.interface.egoForm',
    defaultMessage: 'Ego Form',
    description:
      'Researcher-facing interface name. Form for attributes of the focal interview participant, called ego in network research. Not a protocol-authored stage label.',
  },
  FamilyPedigree: {
    id: 'protocolBuilder.interface.familyPedigree',
    defaultMessage: 'Family Pedigree',
    description:
      'Researcher-facing interface name. Interface for recording a family genealogy. Not a protocol-authored stage label.',
  },
  Geospatial: {
    id: 'protocolBuilder.interface.geospatial',
    defaultMessage: 'Geospatial Interface',
    description:
      'Researcher-facing interface name. Interface for locating network members on a map. Not a protocol-authored stage label.',
  },
  Information: {
    id: 'protocolBuilder.interface.information',
    defaultMessage: 'Information',
    description:
      'Researcher-facing interface name. Interface for presenting researcher-authored information. Not a protocol-authored stage label.',
  },
  NameGenerator: {
    id: 'protocolBuilder.interface.nameGenerator',
    defaultMessage: 'Name Generator (using forms)',
    description:
      'Researcher-facing interface name. Interface for naming network members using forms. Not a protocol-authored stage label.',
  },
  NameGeneratorQuickAdd: {
    id: 'protocolBuilder.interface.nameGeneratorQuickAdd',
    defaultMessage: 'Name Generator (quick add)',
    description:
      'Researcher-facing interface name. Interface for quickly naming network members. Not a protocol-authored stage label.',
  },
  NameGeneratorRoster: {
    id: 'protocolBuilder.interface.nameGeneratorRoster',
    defaultMessage: 'Name Generator for Roster Data',
    description:
      'Researcher-facing interface name. Interface for selecting network members from roster data. Not a protocol-authored stage label.',
  },
  Narrative: {
    id: 'protocolBuilder.interface.narrative',
    defaultMessage: 'Narrative',
    description:
      'Researcher-facing interface name. Interface for recording a narrative. Not a protocol-authored stage label.',
  },
  NarrativePedigree: {
    id: 'protocolBuilder.interface.narrativePedigree',
    defaultMessage: 'Narrative Pedigree',
    description:
      'Researcher-facing interface name. Interface combining a narrative with a family genealogy. Not a protocol-authored stage label.',
  },
  NetworkComposer: {
    id: 'protocolBuilder.interface.networkComposer',
    defaultMessage: 'Network Composer',
    description:
      'Researcher-facing interface name. Interface for building and editing a network. Not a protocol-authored stage label.',
  },
  OneToManyDyadCensus: {
    id: 'protocolBuilder.interface.oneToManyDyadCensus',
    defaultMessage: 'One to Many Dyad Census',
    description:
      "Researcher-facing interface name. Interface for asking about one network member's relationships with several others. Not a protocol-authored stage label.",
  },
  OrdinalBin: {
    id: 'protocolBuilder.interface.ordinalBin',
    defaultMessage: 'Ordinal Bin',
    description:
      'Researcher-facing interface name. Interface for arranging network members in ordered categories. Not a protocol-authored stage label.',
  },
  Sociogram: {
    id: 'protocolBuilder.interface.sociogram',
    defaultMessage: 'Sociogram',
    description:
      'Researcher-facing interface name. Interface for drawing and arranging a network. Not a protocol-authored stage label.',
  },
  TieStrengthCensus: {
    id: 'protocolBuilder.interface.tieStrengthCensus',
    defaultMessage: 'Tie-Strength Census',
    description:
      'Researcher-facing interface name. Interface for reporting the strength of relationships between network members. Not a protocol-authored stage label.',
  },
}) satisfies Record<StageType, MessageDescriptor>;

const englishIntl = createAppIntl({ locale: 'en' });

/**
 * The existing English names are also used when generating initial protocol
 * labels. Keep those independent of the app's presentation preference.
 * Display surfaces use interfaceDisplayName(type, intl) instead.
 */
export const INTERFACE_NAMES = Object.fromEntries(
  Object.entries(interfaceNameMessages).map(([type, message]) => [
    type,
    englishIntl.formatMessage(message),
  ]),
) as Record<StageType, string>;

/** A localized researcher-facing name; undefined for unknown future stage types. */
export const interfaceDisplayName = (
  stageType: string,
  intl: IntlShape = englishIntl,
): string | undefined =>
  Object.hasOwn(interfaceNameMessages, stageType)
    ? intl.formatMessage(interfaceNameMessages[stageType as StageType])
    : undefined;
