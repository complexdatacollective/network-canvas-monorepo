import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { interfaceDisplayName } from '@codaco/protocol-builder/interfaces/interfaceNames';
import { nameLocalizedText } from '@codaco/protocol-builder/localization/localizedTextNames';
import type { CurrentProtocol, LocaleTag } from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import type { TranslationPlace, TranslationRow } from '~/selectors/issues';
import { resolveLocalizedText } from '~/utils/localizedText';

const messages = defineMessages({
  stagePosition: {
    id: 'architect.localization.textPlaces.stagePosition',
    defaultMessage: 'Stage {position, number}',
    description:
      'Names the stage that holds a group of texts in the translation table, before the stage’s name. position is the stage’s place in the protocol, counting from 1.',
  },
  nodeType: {
    id: 'architect.localization.textPlaces.nodeType',
    defaultMessage: 'Node type',
    description:
      'Kind of codebook entry that holds a group of texts in the translation table, before the entry’s name: a node type.',
  },
  edgeType: {
    id: 'architect.localization.textPlaces.edgeType',
    defaultMessage: 'Edge type',
    description:
      'Kind of codebook entry that holds a group of texts in the translation table, before the entry’s name: an edge type.',
  },
  ego: {
    id: 'architect.localization.textPlaces.ego',
    defaultMessage: 'Ego',
    description:
      'Heading of the group of texts in the translation table that belong to the ego (the participant) in the codebook.',
  },
  protocol: {
    id: 'architect.localization.textPlaces.protocol',
    defaultMessage: 'Protocol',
    description:
      'Heading of the group of texts in the translation table that belong to the protocol itself rather than to a stage or codebook entry.',
  },
  unnamed: {
    id: 'architect.localization.textPlaces.unnamed',
    defaultMessage: 'Untitled',
    description:
      'Shown in the translation table in place of the name of a stage or type that has no name.',
  },
});

type FieldPath = TranslationRow['field'];

export type PlaceDetails = {
  /** What kind of place it is, such as "Stage 4" or "Node type". */
  kind: string;
  /**
   * A stage's name, in the protocol's default language, or a type's name;
   * null where `kind` says it all.
   */
  name: Readonly<{ text: string; lang: LocaleTag | null }> | null;
  /** A stage's kind of interface, such as "Information". */
  interfaceName: string | null;
  href: string | null;
  variableNames: (id: string) => string | undefined;
};

export const describePlace = (
  intl: IntlShape,
  protocol: CurrentProtocol,
  place: TranslationPlace,
): PlaceDetails => {
  const { codebook } = protocol;
  const unnamed = intl.formatMessage(messages.unnamed);
  switch (place.kind) {
    case 'stage': {
      const index = protocol.stages.findIndex(({ id }) => id === place.stageId);
      const stage = protocol.stages[index];
      const label = resolveLocalizedText(stage?.label, protocol.localization);
      const name =
        label === null || label.text === ''
          ? { text: unnamed, lang: null }
          : { text: label.text, lang: label.locale };
      return {
        kind: intl.formatMessage(messages.stagePosition, {
          position: index + 1,
        }),
        name,
        interfaceName:
          (stage && interfaceDisplayName(stage.type, intl)) ?? unnamed,
        href: `/protocol/stage/${place.stageId}`,
        variableNames: () => undefined,
      };
    }
    case 'codebook': {
      const definition = codebook[place.entity]?.[place.entityType];
      return {
        kind: intl.formatMessage(
          place.entity === 'node' ? messages.nodeType : messages.edgeType,
        ),
        name: { text: definition?.name || unnamed, lang: null },
        interfaceName: null,
        href: codebookHref({ entity: place.entity, type: place.entityType }),
        variableNames: (id) => definition?.variables?.[id]?.name,
      };
    }
    case 'ego':
      return {
        kind: intl.formatMessage(messages.ego),
        name: null,
        interfaceName: null,
        href: codebookHref(),
        variableNames: (id) => codebook.ego?.variables?.[id]?.name,
      };
    case 'protocol':
      return {
        kind: intl.formatMessage(messages.protocol),
        name: null,
        interfaceName: null,
        href: null,
        variableNames: () => undefined,
      };
  }
};

/**
 * One step of a string's path, as researchers know it: an index counted from
 * 1, and a variable's name in place of its id. Only for a text Architect has
 * no name for.
 */
const formatSegment = (
  intl: IntlShape,
  field: FieldPath,
  index: number,
  variableNames: PlaceDetails['variableNames'],
) => {
  const segment = field[index];
  if (typeof segment === 'number') return intl.formatNumber(segment + 1);
  if (segment === undefined) return '';
  return field[index - 1] === 'variables'
    ? (variableNames(segment) ?? segment)
    : segment;
};

/**
 * The steps from a text's place down to the text, named by what each is,
 * such as "Prompt 2" then "Text". A text with no known name falls back to its
 * path, which reads as code.
 */
export const textSteps = (
  intl: IntlShape,
  protocol: CurrentProtocol,
  row: Pick<TranslationRow, 'path' | 'field'>,
  details: PlaceDetails,
): Readonly<{ steps: readonly string[]; raw: boolean }> => {
  const named = nameLocalizedText(intl, protocol, row.path);
  if (named !== undefined) {
    return { steps: named.map(({ label }) => label), raw: false };
  }
  return {
    steps: row.field.map((_, index) =>
      formatSegment(intl, row.field, index, details.variableNames),
    ),
    raw: true,
  };
};
