import {
  createNodeFromContent,
  isProseMirrorFragment,
  type JSONContent,
} from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { isEqual } from 'es-toolkit';

import { linesOf } from '@codaco/shared-consts';

import { documentInSchema, marksInSchema } from './fitToSchema';
import { INLINE_VALUE_NODE } from './inlineValueNode';
import { VERSIONS_NODE } from './versionsNode';

/** The line being collected, and whether a break is owed before its next text. */
type OneLineRun = {
  collected: JSONContent[];
  breakPending: boolean;
};

const SPACE = ' ';

/**
 * Adds text to the line, joining it to the run before it when they carry the
 * same marks. That is what ProseMirror itself holds, so a flattened value
 * compares equal to the document the editor makes of it.
 */
const pushRun = (
  run: OneLineRun,
  text: string,
  marks: JSONContent['marks'],
) => {
  const carried = marks && marks.length > 0 ? marks : undefined;
  const previous = run.collected.at(-1);

  if (previous?.type === 'text' && isEqual(previous.marks, carried)) {
    previous.text = `${previous.text ?? ''}${text}`;
    return;
  }

  run.collected.push(
    carried === undefined
      ? { type: 'text', text }
      : { type: 'text', marks: carried, text },
  );
};

/**
 * Adds a text node to the line, spelling any break owed before it as one
 * space. The space carries no marks of its own: a bold space would serialise
 * as part of the bold run, and markdown will not open emphasis on a space.
 */
const addText = (
  run: OneLineRun,
  text: string,
  marks: JSONContent['marks'],
) => {
  if (run.breakPending && run.collected.length > 0) {
    pushRun(run, SPACE, undefined);
  }

  run.breakPending = false;
  pushRun(run, text, marks);
};

/**
 * Adds a token to the line, after the space any break before it is owed. A
 * token says something, as text does, so it is never a break itself.
 */
/** Adds an inline atom: a token, or a set of versions, kept whole. */
const addAtom = (run: OneLineRun, atom: JSONContent) => {
  if (run.breakPending && run.collected.length > 0) {
    pushRun(run, SPACE, undefined);
  }

  run.breakPending = false;
  run.collected.push(atom);
};

/**
 * Adds a text node, treating the line breaks INSIDE it as breaks like any
 * other: newlines however a platform spells them, and Unicode's line and
 * paragraph separators, which the schema refuses in one-line text just the
 * same (`linesOf`, the one definition of a line break).
 *
 * A line break can live inside the text itself, where no schema was ever going
 * to refuse it: markdown's own soft break parses to one text node with the
 * newline still in it, and the editor renders with `white-space: pre-wrap`, so
 * the field showed two lines while reporting `aria-multiline="false"` — and
 * saved the break back into the label a participant reads.
 */
const addTextLines = (
  run: OneLineRun,
  text: string,
  marks: JSONContent['marks'],
) => {
  for (const [index, line] of linesOf(text).entries()) {
    if (index > 0) {
      run.breakPending = true;
    }

    if (line !== '') {
      addText(run, line, marks);
    }
  }
};

/**
 * Every line of a document, run together as the inline content of one.
 *
 * This works on the JSON rather than on a parsed document, because on the way
 * IN there is nothing parsed yet — and for a single-line field there cannot
 * be. Its schema has no heading, list or rule in it, `Node.fromJSON` throws on
 * a node type it does not know, and TipTap answers that by handing back an
 * EMPTY document. So a stored heading did not arrive flattened; it arrived as
 * nothing at all, and the next edit saved that emptiness over the researcher's
 * words. Reading the value first is the very thing that fails, so the shape is
 * changed before anything reads it.
 *
 * Text keeps its marks, so a formatted phrase keeps its bold and italic runs:
 * the line loses its line breaks, not its formatting.
 *
 * Every other node is a BREAK in the line — a block boundary, a hard break, an
 * atom this field has no room for, a newline inside the text itself — and
 * however many of them fall together
 * they spell ONE space, and only between text that says something on both
 * sides. Spelling each break separately put one in twice wherever blocks nest
 * (a pasted list arrived as "One  Two"), put one beside an empty paragraph
 * that has nothing on the other side of it, and left the saved line ending in
 * one. Architect's markdown adapter reduces its own blocks by this same rule.
 */
const collectOneLine = (
  content: JSONContent[] | null | undefined,
  run: OneLineRun,
  schema: Schema,
) => {
  for (const node of content ?? []) {
    if (node.type === 'text') {
      if (node.text) {
        addTextLines(run, node.text, marksInSchema(node.marks, schema));
      }
      continue;
    }

    if (
      node.type === INLINE_VALUE_NODE &&
      Object.hasOwn(schema.nodes, INLINE_VALUE_NODE)
    ) {
      const marks = marksInSchema(node.marks, schema);
      addAtom(run, {
        type: INLINE_VALUE_NODE,
        attrs: { id: node.attrs?.id },
        ...(marks !== undefined && marks.length > 0 && { marks }),
      });
      continue;
    }

    // Its versions live in its attributes, not its content, so it is kept
    // whole rather than read through.
    if (
      node.type === VERSIONS_NODE &&
      Object.hasOwn(schema.nodes, VERSIONS_NODE)
    ) {
      addAtom(run, documentInSchema(node, schema));
      continue;
    }

    // Owed on both sides of whatever this node holds: the text after a block
    // is on a new line, and so is the text after the block ends.
    run.breakPending = true;
    collectOneLine(node.content, run, schema);
    run.breakPending = true;
  }
};

/** The inline content a document's lines make when run together as one. */
export const oneLineContentOf = (
  content: JSONContent[] | null | undefined,
  schema: Schema,
): JSONContent[] => {
  const run: OneLineRun = { collected: [], breakPending: false };
  collectOneLine(content, run, schema);
  return run.collected;
};

/**
 * The one-paragraph document a value makes.
 *
 * An empty paragraph carries no `content` at all, which is how ProseMirror
 * writes one: the flattened value has to be comparable to the document the
 * editor holds, key for key.
 */
export const oneLineDocumentOf = (
  value: JSONContent,
  schema: Schema,
): JSONContent => {
  const content = oneLineContentOf(value.content, schema);

  return {
    type: 'doc',
    content: [
      content.length > 0
        ? { type: 'paragraph', content }
        : { type: 'paragraph' },
    ],
  };
};

/**
 * The flattened value as the editor will hold it.
 *
 * Only the comparison in the sync effect needs this: reading the flattened
 * document through the schema fills in the mark attributes a stored value can
 * leave out, so a host echoing its own value back settles instead of having
 * the document replaced on every pass. The document is a paragraph of text by
 * then, and the marks are the ones this schema has, so the read cannot fail
 * on a type it does not know. `createNodeFromContent` is the reader TipTap's
 * own `content` option uses, so both ways in agree.
 */
export const asOneLine = (value: JSONContent, schema: Schema): JSONContent => {
  const flattened = oneLineDocumentOf(value, schema);
  const parsed = createNodeFromContent(flattened, schema, { slice: false });

  // A fragment only comes back from that reader's own empty-content fallback.
  if (isProseMirrorFragment(parsed)) return flattened;

  // ProseMirror types `toJSON()` as `any`; a node's JSON is the JSONContent
  // shape by construction.
  const json: JSONContent = parsed.toJSON();
  return json;
};
