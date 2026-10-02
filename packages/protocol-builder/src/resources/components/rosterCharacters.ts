import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  findRosterCharacterProblems,
  type RosterCharacterProblem,
} from '@codaco/protocol-validation';

import { fileExtension } from './resourceKinds.ts';

const messages = defineMessages({
  columnName: {
    id: 'protocolBuilder.rosterCharacters.columnName',
    defaultMessage:
      'The header of column {column} contains a character that can’t be used ({character}). Delete it from the file, then import the file again.{others, plural, =0 {} one { The same problem appears in # other place in the file.} other { The same problem appears in # other places in the file.}}',
    description:
      'Refusal shown when the header of a column in a CSV data file (a roster) a researcher chose contains a character Network Canvas can’t store. column is the column’s position, counting from 1 at the left. character is the character’s Unicode code point, such as U+0007, and stays as written. It is usually an invisible control character pasted in from another program, which an exported file could not hold. others is how many more places in the file have the same problem; when it is 0 nothing more is said.',
  },
  cell: {
    id: 'protocolBuilder.rosterCharacters.cell',
    defaultMessage:
      'Row {row} of the “{column}” column contains a character that can’t be used ({character}). Delete it from the file, then import the file again.{others, plural, =0 {} one { The same problem appears in # other place in the file.} other { The same problem appears in # other places in the file.}}',
    description:
      'Refusal shown when a cell of a CSV data file (a roster) a researcher chose contains a character Network Canvas can’t store. row is the row number a spreadsheet shows, where the header is row 1; column is the researcher’s own column header. character is the character’s Unicode code point, such as U+0007, and stays as written. It is usually an invisible control character pasted in from another program, which an exported file could not hold. others is how many more places in the file have the same problem; when it is 0 nothing more is said.',
  },
  attributeName: {
    id: 'protocolBuilder.rosterCharacters.attributeName',
    defaultMessage:
      'An attribute name in node {node} contains a character that can’t be used ({character}). Delete it from the file, then import the file again.{others, plural, =0 {} one { The same problem appears in # other place in the file.} other { The same problem appears in # other places in the file.}}',
    description:
      'Refusal shown when an attribute name in a JSON data file (a roster) a researcher chose contains a character Network Canvas can’t store. node is the node’s position in the file’s list of nodes, counting from 1. character is the character’s Unicode code point, such as U+0007, and stays as written. It is usually an invisible control character pasted in from another program, which an exported file could not hold. others is how many more places in the file have the same problem; when it is 0 nothing more is said.',
  },
  attributeValue: {
    id: 'protocolBuilder.rosterCharacters.attributeValue',
    defaultMessage:
      'The “{attribute}” attribute of node {node} contains a character that can’t be used ({character}). Delete it from the file, then import the file again.{others, plural, =0 {} one { The same problem appears in # other place in the file.} other { The same problem appears in # other places in the file.}}',
    description:
      'Refusal shown when an attribute value in a JSON data file (a roster) a researcher chose contains a character Network Canvas can’t store. attribute is the attribute’s name as the file writes it; node is the node’s position in the file’s list of nodes, counting from 1. character is the character’s Unicode code point, such as U+0007, and stays as written. It is usually an invisible control character pasted in from another program, which an exported file could not hold. others is how many more places in the file have the same problem; when it is 0 nothing more is said.',
  },
  line: {
    id: 'protocolBuilder.rosterCharacters.line',
    defaultMessage:
      'Line {line} of this file contains a character that can’t be used ({character}). Delete it from the file, then import the file again.{others, plural, =0 {} one { The same problem appears in # other place in the file.} other { The same problem appears in # other places in the file.}}',
    description:
      'Refusal shown when a data file (a roster, CSV or JSON) a researcher chose contains a character Network Canvas can’t store, somewhere that can only be pointed to by its line. line is the line number a text editor shows, counting from 1. character is the character’s Unicode code point, such as U+0007, and stays as written. It is usually an invisible control character pasted in from another program, which an exported file could not hold. others is how many more places in the file have the same problem; when it is 0 nothing more is said.',
  },
});

function problemMessage(problem: RosterCharacterProblem, others: number) {
  switch (problem.kind) {
    case 'columnName':
      return createMessageError(messages.columnName, {
        column: problem.column,
        character: problem.character,
        others,
      });
    case 'cell':
      return createMessageError(messages.cell, {
        row: problem.row,
        column: problem.column,
        character: problem.character,
        others,
      });
    case 'attributeName':
      return createMessageError(messages.attributeName, {
        node: problem.node,
        character: problem.character,
        others,
      });
    case 'attributeValue':
      return createMessageError(messages.attributeValue, {
        node: problem.node,
        attribute: problem.attribute,
        character: problem.character,
        others,
      });
    case 'line':
      return createMessageError(messages.line, {
        line: problem.line,
        character: problem.character,
        others,
      });
  }
}

/**
 * Why a roster cannot be imported because it holds a character no export can
 * carry, naming the first place it is; `undefined` when it holds none.
 *
 * Encoded rather than formatted, like the upload control's other refusals, so
 * it follows a change of language while it is on screen. The file's format is
 * decided by its extension, as every reader of a roster decides it.
 */
export async function rosterCharacterRefusal(
  bytes: Uint8Array,
  filename: string,
): Promise<string | undefined> {
  const { problems, total } = await findRosterCharacterProblems(
    new TextDecoder().decode(bytes),
    fileExtension(filename) === '.csv' ? 'csv' : 'json',
  );
  const [first] = problems;
  return first === undefined ? undefined : problemMessage(first, total - 1);
}
