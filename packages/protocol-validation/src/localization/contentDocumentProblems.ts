import {
  type ContentDocumentProblemKind,
  fieldIdsIn,
  readContentDocument,
} from './contentDocument.ts';
import { messageStructure } from './messageStructure.ts';

/** What a text may contain, as its declaration says (`LocalizedTextShape`). */
type TextShape = Readonly<{
  format: 'plain' | 'markdown';
  lines: 'single' | 'multiple';
  fieldBlocks?: true;
}>;

/**
 * The problems of a text read as a document, as researchers are told them.
 * `unreadable` is not among them: the text's syntax check reports it first.
 */
export const CONTENT_DOCUMENT_PROBLEMS: Readonly<
  Record<Exclude<ContentDocumentProblemKind, 'unreadable'>, string>
> & { fieldNotAllowedHere: string } = {
  inlineChoice:
    'This wording chooses between versions inside a sentence. Use a dynamic attribute instead.',
  unrecognisedLogic:
    'This wording chooses between versions in a way that is not a logic block. Use a logic block or a dynamic attribute instead.',
  fieldNotOwnParagraph:
    'A field in this form is not a paragraph of its own. Put the field on its own, outside any heading, link or quotation, with a blank line before and after it.',
  fieldInList:
    'A field in this form is inside a list. Move it out of the list.',
  fieldHasDescription:
    'A field in this form has alternative text, which a field cannot have.',
  fieldNotStandard:
    'A field in this form is not written in the standard way. Write it as ![](field:<id>), where <id> is the id of the field, with nothing else inside the parentheses.',
  fieldByReference:
    'A field in this form is named through a reference. Write the field’s address in the image itself.',
  fieldNotAllowedHere:
    'This wording cannot contain fields. Only a form can contain fields.',
};

const FIELD_PROBLEMS: ReadonlySet<ContentDocumentProblemKind> =
  new Set<ContentDocumentProblemKind>([
    'fieldNotOwnParagraph',
    'fieldInList',
    'fieldHasDescription',
    'fieldNotStandard',
    'fieldByReference',
  ]);

/**
 * Why a translation of a text with this shape cannot be read as the
 * document that it must be, or undefined when it can:
 * - in one-line or plain text, any choice between versions is inside a
 *   sentence (`inlineChoice`): only markdown of several lines has logic
 *   blocks;
 * - in markdown of several lines, a choice that is not a logic block, and a
 *   field that is not a block of its own, or that the text cannot contain.
 *
 * A message that cannot be parsed is the syntax check's to report.
 */
export const findContentDocumentTextProblem = (
  message: string,
  shape: TextShape,
): string | undefined => {
  if (!message.includes('{') && !/field/i.test(message)) return undefined;
  if (shape.format !== 'markdown' || shape.lines !== 'multiple') {
    const structure = messageStructure(message);
    return 'nodes' in structure &&
      structure.nodes.some((node) => node.kind === 'switch')
      ? CONTENT_DOCUMENT_PROBLEMS.inlineChoice
      : undefined;
  }
  const { nodes, problems } = readContentDocument(message);
  const fieldsAllowed = shape.fieldBlocks === true;
  for (const { kind } of problems) {
    if (kind === 'unreadable') return undefined;
    if (!fieldsAllowed && FIELD_PROBLEMS.has(kind)) {
      return CONTENT_DOCUMENT_PROBLEMS.fieldNotAllowedHere;
    }
    return CONTENT_DOCUMENT_PROBLEMS[kind];
  }
  if (!fieldsAllowed && fieldIdsIn(nodes).length > 0) {
    return CONTENT_DOCUMENT_PROBLEMS.fieldNotAllowedHere;
  }
  return undefined;
};
