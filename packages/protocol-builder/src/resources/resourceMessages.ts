import {
  createMessageError,
  defineMessages,
} from '@codaco/app-i18n/message-errors';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';

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
 *
 * Loaded at run time only through `@codaco/app-i18n/message-errors`, which
 * carries no React, so a host that runs on a server (Studio's API) refuses in
 * these same words by importing this module.
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
      'Names the entry at fault in an imported roster. "Node" is the network-research term for one person or entity in the data; position is the node’s position in the file’s list of nodes, counting from 1. Appears after a clause of its own, so it is lower case and has no full stop.',
  },
  rosterNodeAttributesNotObject: {
    id: 'protocolBuilder.resourceFailure.rosterNodeAttributesNotObject',
    defaultMessage: 'the attributes of node {position} are not an object',
    description:
      'Names the entry at fault in an imported roster whose attributes are malformed. "Node" is one person or entity in network data; position is the node’s position in the file’s list of nodes, counting from 1. Lower case and without a full stop.',
  },
  rosterValueUnusableInRow: {
    id: 'protocolBuilder.resourceFailure.rosterValueUnusableInRow',
    defaultMessage:
      'the "{name}" attribute of row {row} is not a value a variable can hold',
    description:
      'Names the cell at fault in an imported spreadsheet roster. name is the researcher’s own column heading; row is the row number a spreadsheet shows, where the header is row 1. "Attribute" and "variable" are the data fields a protocol records. Lower case and without a full stop.',
  },
  rosterValueUnusableInNode: {
    id: 'protocolBuilder.resourceFailure.rosterValueUnusableInNode',
    defaultMessage:
      'the "{name}" attribute of node {position} is not a value a variable can hold',
    description:
      'Names the attribute at fault in an imported JSON roster. name is the researcher’s own attribute name; "node" is one person or entity in network data and position is the node’s position in the file’s list of nodes, counting from 1. Lower case and without a full stop.',
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
      'the "{name}" attribute cannot be used as a variable name: a name cannot be empty, start or end with a space, or contain line breaks, tabs or other control characters',
    description:
      'Refusal shown when an imported roster carries a column or attribute name a protocol variable cannot take — a heading that is empty, one with a space at the start or end, or one holding a line break, a tab or another control character. name is that heading, left exactly as the researcher wrote it. Names may otherwise be written in any language or script, with spaces and punctuation inside them. Lower case and without a full stop.',
  },
  rosterAttributeNameDuplicate: {
    id: 'protocolBuilder.resourceFailure.rosterAttributeNameDuplicate',
    defaultMessage:
      'the "{first}" and "{second}" attributes are the same name written in two different ways, such as an accented letter typed as one character in one and as two in the other',
    description:
      'Refusal shown when an imported roster carries two column or attribute names that look identical but are stored differently: the same accented letter is typed as a single character in one and as a plain letter followed by a separate accent mark in the other. An interview would fill one variable from both and lose one column’s values. first and second are those two headings, left exactly as the researcher wrote them, so they usually look the same. Names that differ only in capital letters are not refused. Lower case and without a full stop.',
  },
  oversizeFile: {
    id: 'protocolBuilder.resourceKinds.oversizeFile',
    defaultMessage:
      'That file is too large to import. Files can be up to {size}.',
    description:
      'Refusal shown when a researcher chooses a file bigger than the editor will read. size is a rounded human-readable size such as "8.0 MB", already localized.',
  },
  byteLengthBytes: {
    id: 'protocolBuilder.resourceKinds.byteLengthBytes',
    defaultMessage: '{size, number} bytes',
    description:
      'A resource’s stored size when it is under one kilobyte. size is the exact byte count.',
  },
  byteLengthKilobytes: {
    id: 'protocolBuilder.resourceKinds.byteLengthKilobytes',
    defaultMessage: '{size, number, ::.0} KB',
    description:
      'A resource’s stored size in kilobytes, always to one decimal place. size is that already-rounded number; KB is the unit symbol.',
  },
  byteLengthMegabytes: {
    id: 'protocolBuilder.resourceKinds.byteLengthMegabytes',
    defaultMessage: '{size, number, ::.0} MB',
    description:
      'A resource’s stored size in megabytes, always to one decimal place. size is that already-rounded number; MB is the unit symbol.',
  },
});

/**
 * The descriptor and value that say how big a resource's content is.
 *
 * The rounding stays here rather than moving into ICU: `toFixed(1)` is what
 * decides `2.0 KB` rather than `1.953 KB`, and the `::.0` skeleton on each
 * message is only what keeps the trailing zero once it has.
 */
export function byteLengthMessage(byteLength: number): Readonly<{
  message: MessageDescriptor;
  values: Readonly<{ size: number }>;
}> {
  if (byteLength < 1024) {
    return {
      message: resourceFailureMessages.byteLengthBytes,
      values: { size: byteLength },
    };
  }
  if (byteLength < 1024 * 1024) {
    return {
      message: resourceFailureMessages.byteLengthKilobytes,
      values: { size: Number((byteLength / 1024).toFixed(1)) },
    };
  }
  return {
    message: resourceFailureMessages.byteLengthMegabytes,
    values: { size: Number((byteLength / (1024 * 1024)).toFixed(1)) },
  };
}

/**
 * What a researcher is told when the file they chose is too big to import.
 * One sentence with the limit in it, so it can be translated whole.
 */
export function oversizeFileMessage(maxByteLength: number): string {
  const size = byteLengthMessage(maxByteLength);
  return createMessageError(resourceFailureMessages.oversizeFile, {
    size: { messageError: createMessageError(size.message, size.values) },
  });
}
