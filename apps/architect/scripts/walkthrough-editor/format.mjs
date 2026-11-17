// Reads and writes the walkthrough markdown files
// (src/components/StageEditor/walkthrough/content) as a structured document,
// so the editor can show steps, directives and do / avoid cards as fields.
//
// The rules follow parseWalkthrough.ts: "# " is the title, "## " starts a
// step, HTML-comment directives say where a step points, "> Do:" and
// "> Avoid:" lines are cards, and "include:" comments pull in shared steps.
// serialize(parse(source)) reproduces every file in the folder byte for byte;
// format.test.mjs checks that.
//
// Loaded by the editor server (Node) and by the editor page (browser), so it
// imports nothing.

export const DIRECTIVES = ['section', 'field', 'control', 'scene'];

const DIRECTIVE = /^<!--\s*(section|field|control|scene):\s*(.*?)\s*-->$/;
const INCLUDE = /^<!--\s*include:\s*(.*?)\s*-->$/;
const PRACTICE = /^>\s*(Do|Avoid):\s*(.*)$/i;

const isItemStart = (line) =>
  line.startsWith('## ') || INCLUDE.test(line.trim());

const trimBlankLines = (lines) => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
};

function bodyBlocks(lines) {
  const blocks = [];
  let text = [];
  const flush = () => {
    const kept = trimBlankLines(text);
    if (kept.length > 0) blocks.push({ type: 'text', text: kept.join('\n') });
    text = [];
  };
  for (const line of lines) {
    const practice = PRACTICE.exec(line.trim());
    if (practice) {
      flush();
      blocks.push({
        type: practice[1].toLowerCase() === 'do' ? 'do' : 'avoid',
        text: practice[2],
      });
    } else {
      text.push(line);
    }
  }
  flush();
  return blocks;
}

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
 */
export function parse(source) {
  const lines = source.split(/\r?\n/);

  // Everything before the "# " title (or, in a shared file with no title,
  // before the first step) is kept verbatim: it is the authors' note.
  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  const firstItem = lines.findIndex(isItemStart);
  const headEnd =
    titleIndex !== -1 && (firstItem === -1 || titleIndex < firstItem)
      ? titleIndex
      : firstItem === -1
        ? lines.length
        : firstItem;
  const preamble = lines.slice(0, headEnd).join('\n');
  const title =
    headEnd === titleIndex ? lines[titleIndex].slice(2).trim() : null;

  let index = title === null ? headEnd : headEnd + 1;
  const intro = [];
  while (index < lines.length && !isItemStart(lines[index])) {
    intro.push(lines[index]);
    index += 1;
  }

  const items = [];
  let step;
  const finishStep = () => {
    if (step === undefined) return;
    items.push({
      type: 'step',
      title: step.title,
      directives: step.directives,
      blocks: bodyBlocks(step.body),
    });
    step = undefined;
  };
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) {
      finishStep();
      step = { title: line.slice(3).trim(), directives: [], body: [] };
      continue;
    }
    const include = INCLUDE.exec(line.trim());
    if (include) {
      finishStep();
      items.push({ type: 'include', name: include[1] });
      continue;
    }
    if (step === undefined) {
      if (line.trim() !== '') {
        throw new Error(
          `Line ${index + 1} sits between an include and the next step: "${line}"`,
        );
      }
      continue;
    }
    const directive = DIRECTIVE.exec(line.trim());
    if (directive && step.body.every((bodyLine) => bodyLine.trim() === '')) {
      step.directives.push({ name: directive[1], value: directive[2] });
    } else {
      step.body.push(line);
    }
  }
  finishStep();

  return {
    preamble: trimBlankLines(preamble.split('\n')).join('\n'),
    title,
    intro: trimBlankLines(intro).join('\n'),
    items,
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

/**
 * Problems the walkthrough would hit at run time: an include or scene that
 * does not exist throws or shows nothing, and an untitled step has no heading.
 */
export function problems(doc, { scenes, shared }) {
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
    if (item.blocks.every((block) => block.text.trim() === '')) {
      found.push({ index, message: 'This step has no text.' });
    }
  });
  return found;
}
