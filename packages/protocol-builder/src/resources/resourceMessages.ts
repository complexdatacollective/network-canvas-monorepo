import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Every researcher-facing refusal this package's own resource code produces.
 *
 * One home rather than one per module, because these messages cross a
 * string-only contract (`ResourceGatewayFailure.message`): they are encoded
 * with `createMessageError` where they are produced and decoded with
 * `formatMessageError(text, intl) ?? text` where they are rendered. The
 * `?? text` is what keeps a host's own plain-string failure working unchanged
 * — the host writes the rest of what a researcher reads here, in its own
 * language, and nothing in this package translates it.
 */
export const resourceFailureMessages = defineMessages({
  unreachable: {
    id: 'protocolBuilder.resourceFailure.unreachable',
    defaultMessage: 'The resource could not be reached. Try again in a moment.',
    description:
      'Shown to a researcher when the host storing protocol resources (images, audio, rosters, API keys) threw instead of answering. Deliberately says nothing about the host.',
  },
  resourceLeaving: {
    id: 'protocolBuilder.resourceFailure.resourceLeaving',
    defaultMessage:
      'That resource is being discarded, so it cannot be used here. Choose a different one.',
    description:
      'Refusal shown when a researcher picks a resource another field is in the middle of discarding.',
  },
  resourceDiscarded: {
    id: 'protocolBuilder.resourceFailure.resourceDiscarded',
    defaultMessage:
      'That resource is no longer available: it was discarded while this list was open. Close and reopen the browser to see what there is.',
    description:
      'Refusal shown when a researcher picks a resource from a list read before that resource was discarded. "The browser" is this app’s resource-picking dialog, not the web browser.',
  },
  rosterUnreadable: {
    id: 'protocolBuilder.resourceFailure.rosterUnreadable',
    defaultMessage: 'the selected file is not a readable network',
    description:
      'Refusal shown when an imported roster (participant data an interview reads) cannot be parsed as network data. "Network" is the network-research sense: people and the ties between them. Lower case and without a full stop.',
  },
  rosterUnreadableDetail: {
    id: 'protocolBuilder.resourceFailure.rosterUnreadableDetail',
    defaultMessage: 'the selected file is not a readable network: {detail}',
    description:
      'The same refusal as rosterUnreadable, with the specific fault named. detail is one of the roster* messages below, already localized. Lower case and without a full stop.',
  },
  rosterNodeNotObject: {
    id: 'protocolBuilder.resourceFailure.rosterNodeNotObject',
    defaultMessage: 'node {position} is not an object',
    description:
      'Names the entry at fault in an imported roster. "Node" is the network-research term for one person or entity in the data; position is its one-based place in the file. Appears after a clause of its own, so it is lower case and has no full stop.',
  },
  rosterNodeAttributesNotObject: {
    id: 'protocolBuilder.resourceFailure.rosterNodeAttributesNotObject',
    defaultMessage: 'the attributes of node {position} are not an object',
    description:
      'Names the entry at fault in an imported roster whose attributes are malformed. "Node" is one person or entity in network data; position is its one-based place in the file. Lower case and without a full stop.',
  },
  rosterValueUnusableInRow: {
    id: 'protocolBuilder.resourceFailure.rosterValueUnusableInRow',
    defaultMessage:
      'the "{name}" attribute of row {row} is not a value a variable can hold',
    description:
      'Names the cell at fault in an imported spreadsheet roster. name is the researcher’s own column heading; row is its one-based line in the file. "Attribute" and "variable" are the data fields a protocol records. Lower case and without a full stop.',
  },
  rosterValueUnusableInNode: {
    id: 'protocolBuilder.resourceFailure.rosterValueUnusableInNode',
    defaultMessage:
      'the "{name}" attribute of node {position} is not a value a variable can hold',
    description:
      'Names the attribute at fault in an imported JSON roster. name is the researcher’s own attribute name; "node" is one person or entity in network data and position is its one-based place in the file. Lower case and without a full stop.',
  },
  rosterEmpty: {
    id: 'protocolBuilder.resourceFailure.rosterEmpty',
    defaultMessage:
      'the selected file has no records in it, so a stage using it would have nobody to show',
    description:
      'Refusal shown when an imported roster parsed correctly but holds no entries. "Stage" is one step of an interview. Lower case and without a full stop.',
  },
  rosterAttributeNameUnusable: {
    id: 'protocolBuilder.resourceFailure.rosterAttributeNameUnusable',
    defaultMessage:
      'the "{name}" attribute cannot be used as a variable name: names may hold only letters, digits, and the characters . _ - :',
    description:
      'Refusal shown when an imported roster carries a column or attribute name a protocol variable cannot take — a spreadsheet heading such as "home address". name is that heading, left exactly as the researcher wrote it. Lower case and without a full stop.',
  },
});
