import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

/**
 * The marks a node can keep: the ones `schema` has a type for.
 *
 * Which marks an editor has depends on what its field offers (links are a
 * toolbar option), so a value can carry a mark the editor reading it has no
 * type for. `Node.fromJSON` refuses an unknown mark exactly as it refuses an
 * unknown node, and TipTap answers that with an EMPTY document: the words
 * vanish, and the next edit saves the blank over them. The words are what a
 * field promises to keep; a mark it does not offer is dropped instead.
 */
export const marksInSchema = (
  marks: JSONContent['marks'],
  schema: Schema,
): JSONContent['marks'] =>
  marks?.filter((mark) => Object.hasOwn(schema.marks, mark.type));

const hasForeignMark = (node: JSONContent, schema: Schema): boolean =>
  (node.marks ?? []).some((mark) => !Object.hasOwn(schema.marks, mark.type)) ||
  (node.content ?? []).some((child) => hasForeignMark(child, schema));

const fitNode = (node: JSONContent, schema: Schema): JSONContent => {
  const { marks, content, ...rest } = node;
  const kept = marksInSchema(marks, schema);
  return {
    ...rest,
    ...(kept !== undefined && kept.length > 0 && { marks: kept }),
    ...(content !== undefined && {
      content: content.map((child) => fitNode(child, schema)),
    }),
  };
};

/**
 * `content` with only the marks `schema` has a type for, at any depth. Given
 * back unchanged (the same array) when it holds none other, so a host value
 * still compares equal to the document the editor made of it.
 */
export const contentInSchema = (
  content: readonly JSONContent[],
  schema: Schema,
): readonly JSONContent[] =>
  content.some((node) => hasForeignMark(node, schema))
    ? content.map((node) => fitNode(node, schema))
    : content;

/** A whole document fitted as `contentInSchema` fits its content. */
export const documentInSchema = (
  document: JSONContent,
  schema: Schema,
): JSONContent =>
  hasForeignMark(document, schema) ? fitNode(document, schema) : document;
