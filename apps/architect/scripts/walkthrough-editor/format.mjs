// Reads and writes the walkthrough markdown files
// (src/components/StageEditor/walkthrough/content) as a structured document,
// so the editor can show steps, directives and do / avoid cards as fields.
//
// The format itself is defined once, in walkthroughFormat.ts beside the app's
// parser: parse() is its lexer's output in the shape the editor edits, with
// each card its own block. serialize(parse(source)) reproduces every content
// file byte for byte; scripts/__tests__/walkthrough-editor-format.test.ts
// checks that.
//
// Loaded by the editor server and the test under Node (which strips the
// types from walkthroughFormat.ts), and by the editor page, which the server
// sends this file and a stripped copy of walkthroughFormat.ts. The server
// serves both at their paths under apps/architect, so the relative import
// below resolves in the browser too.

import {
  CONTROLS,
  DIRECTIVES,
  lexWalkthrough,
} from '../../src/components/StageEditor/walkthrough/walkthroughFormat.ts';

export { CONTROLS, DIRECTIVES };

/**
 * @param {string} source
 * @returns {{
 *   preamble: string,
 *   title: string | null,
 *   intro: string,
 *   items: Array<
 *     | { type: 'step', title: string, directives: Array<{ name: string, value: string }>, blocks: Array<{ type: 'text' | 'do' | 'avoid', text: string }> }
 *     | { type: 'include', name: string }
 *   >,
 * }}
 * @throws when the source breaks the format.
 */
export function parse(source) {
  const { preamble, title, intro, items } = lexWalkthrough(source);
  return {
    preamble,
    title,
    intro,
    items: items.map((item) =>
      item.type === 'include'
        ? { type: 'include', name: item.name }
        : {
            type: 'step',
            title: item.title,
            directives: item.directives.map(({ name, value }) => ({
              name,
              value,
            })),
            blocks: item.blocks.flatMap((block) =>
              block.kind === 'text'
                ? [{ type: 'text', text: block.text }]
                : block.items.map(({ kind, text }) => ({ type: kind, text })),
            ),
          },
    ),
  };
}

const blockText = (block) =>
  block.type === 'text'
    ? block.text.trim()
    : `> ${block.type === 'do' ? 'Do' : 'Avoid'}: ${block.text.trim()}`;

/** The markdown file for a document from parse(). */
export function serialize(doc) {
  const parts = [];
  if (doc.preamble.trim() !== '') parts.push(doc.preamble.trim());
  if (doc.title !== null) parts.push(`# ${doc.title.trim()}`);
  if (doc.intro.trim() !== '') parts.push(doc.intro.trim());
  for (const item of doc.items) {
    if (item.type === 'include') {
      parts.push(`<!-- include: ${item.name.trim()} -->`);
      continue;
    }
    parts.push(`## ${item.title.trim()}`);
    const directives = item.directives
      .filter((directive) => directive.value.trim() !== '')
      .map(
        (directive) => `<!-- ${directive.name}: ${directive.value.trim()} -->`,
      );
    if (directives.length > 0) parts.push(directives.join('\n'));
    for (const block of item.blocks) {
      if (block.text.trim() !== '') parts.push(blockText(block));
    }
  }
  return `${parts.join('\n\n')}\n`;
}

// A line in a text block that the format reads as something other than text,
// so the saved file would not say what the editor shows.
const STRUCTURAL_LINE = new RegExp(
  `^(## |<!--\\s*(${[...DIRECTIVES, 'include'].join('|')}):)`,
);

/**
 * Problems the walkthrough would hit at run time: an include, scene,
 * section or control that does not exist throws or shows nothing, an untitled step has
 * no heading, and a directive typed into a step's text would make the saved
 * file unreadable.
 */
export function problems(doc, { scenes, shared, sections = [] }) {
  const found = [];
  doc.items.forEach((item, index) => {
    if (item.type === 'include') {
      if (!shared.includes(item.name)) {
        found.push({
          index,
          message: `No shared steps called "${item.name}". The walkthrough will fail to load.`,
        });
      }
      return;
    }
    if (item.title.trim() === '') {
      found.push({ index, message: 'This step has no title.' });
    }
    for (const directive of item.directives) {
      if (
        directive.name === 'scene' &&
        directive.value.trim() !== '' &&
        !scenes.includes(directive.value.trim())
      ) {
        found.push({
          index,
          message: `No animation called "${directive.value}". Nothing will play.`,
        });
      }
    }
    for (const directive of item.directives) {
      if (
        directive.name === 'section' &&
        sections.length > 0 &&
        directive.value.trim() !== '' &&
        !sections.includes(directive.value.trim())
      ) {
        found.push({
          index,
          message: `No section with the key "${directive.value}". Nothing will be highlighted.`,
        });
      }
    }
    for (const directive of item.directives) {
      if (
        directive.name === 'control' &&
        directive.value.trim() !== '' &&
        !CONTROLS.includes(directive.value.trim())
      ) {
        found.push({
          index,
          message: `No control called "${directive.value}". Known controls: ${CONTROLS.join(', ')}.`,
        });
      }
    }
    if (
      item.blocks.some((block) =>
        block.text
          .split('\n')
          .some((line) => STRUCTURAL_LINE.test(line.trim())),
      )
    ) {
      found.push({
        index,
        message:
          'A heading, directive or include in the text. Use the fields and buttons for those instead.',
      });
    }
    if (item.blocks.every((block) => block.text.trim() === '')) {
      found.push({ index, message: 'This step has no text.' });
    }
  });
  return found;
}
