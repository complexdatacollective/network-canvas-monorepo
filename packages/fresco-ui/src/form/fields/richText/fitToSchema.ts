import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

// A stored value can hold anything (fields tolerate every value shape), so a
// node that is not an object is left as it is for the editor to refuse.
const isNode = (node: unknown): node is JSONContent =>
  typeof node === 'object' && node !== null;

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
  marks?.filter(
    (mark) => !isNode(mark) || Object.hasOwn(schema.marks, mark.type),
  );

const hasForeignMark = (node: JSONContent, schema: Schema): boolean =>
  isNode(node) &&
  ((Array.isArray(node.marks) &&
    node.marks.some(
      (mark) => isNode(mark) && !Object.hasOwn(schema.marks, mark.type),
    )) ||
    (Array.isArray(node.content) &&
      node.content.some((child) => hasForeignMark(child, schema))));

const fitNode = (node: JSONContent, schema: Schema): JSONContent => {
  if (!isNode(node)) return node;
  const { marks, content, ...rest } = node;
  const kept = marksInSchema(marks, schema);
  return {
    ...rest,
    ...(kept !== undefined && kept.length > 0 && { marks: kept }),
    ...(Array.isArray(content) && {
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

/** Whether `schema` can read `node`, with everything it holds. */
const readableIn = (node: JSONContent, schema: Schema): boolean => {
  if (!isNode(node) || typeof node.type !== 'string') return false;
  try {
    schema.nodeFromJSON(node).check();
    return true;
  } catch {
    return false;
  }
};

/**
 * `content` without the nodes `schema` cannot read: one with no type, a type
 * the editor does not have, or a shape its type refuses. A version arrives
 * from stored or pasted JSON, and one node the editor cannot read would stop
 * the whole field; it is dropped instead, as an unreadable version is. Given
 * back unchanged (the same array) when every node can be read.
 */
export const readableContent = (
  content: readonly JSONContent[],
  schema: Schema,
): readonly JSONContent[] =>
  content.every((node) => readableIn(node, schema))
    ? content
    : content.filter((node) => readableIn(node, schema));
