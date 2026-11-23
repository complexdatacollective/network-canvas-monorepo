// The walkthrough markdown format, defined once.
//
// A content file is read by two programs: the app (parseWalkthrough.ts), which
// turns it into the walkthrough panel, and the local authoring tool
// (scripts/walkthrough-editor), which edits it and writes it back. Both read
// files through lexWalkthrough, so they cannot disagree about what a file
// says.
//
// The format:
//
// - Everything above the "# " title is an authors' note, ignored. A shared
//   file has no title; its note runs to the first step.
// - Text between the title and the first step is an introduction, ignored by
//   the app.
// - "## " starts a step. Its directives (HTML comments naming one of
//   DIRECTIVES) sit at the top of the step, before any text, at most one of
//   each. A comment naming anything else is ordinary text.
// - "> Do:" and "> Avoid:" lines are practice cards. Cards with only blank
//   lines between them form one group.
// - "<!-- include: name -->", on its own line, ends the current step and
//   stands for the steps of shared/<name>.md. Only blank lines may follow it
//   before the next step or include. A shared file cannot include another.
//
// Anything that breaks these rules throws, naming the line.
//
// This module must stay dependency-free, erasable TypeScript (no enums,
// namespaces or parameter properties): the editor's Node server imports it
// under Node's type stripping, and serves it, stripped, to the editor page.

export const DIRECTIVES = ['section', 'field', 'control', 'scene'] as const;

export type DirectiveName = (typeof DIRECTIVES)[number];

/**
 * Controls outside the stage's sections that a `control:` directive can name,
 * each marked in the app by a matching `data-walkthrough-control` attribute.
 */
export const CONTROLS = ['preview'] as const;

// Each matches one trimmed line.
const DIRECTIVE_LINE = new RegExp(
  `^<!--\\s*(${DIRECTIVES.join('|')}):\\s*(.*?)\\s*-->$`,
);
const INCLUDE_LINE = /^<!--\s*include:\s*(.*?)\s*-->$/;
const PRACTICE_LINE = /^>\s*(Do|Avoid):\s*(.*)$/i;

export type Directive = { name: DirectiveName; value: string };

export type Practice = { kind: 'do' | 'avoid'; text: string };

export type LexedBlock =
  | { kind: 'text'; text: string }
  | { kind: 'practices'; items: Practice[] };

export type LexedStep = {
  type: 'step';
  title: string;
  /** In the order the file gives them; each name at most once. */
  directives: Directive[];
  blocks: LexedBlock[];
};

export type LexedInclude = { type: 'include'; name: string };

export type LexedItem = LexedStep | LexedInclude;

export type LexedFile = {
  /** The authors' note above the title (or above the first step). */
  preamble: string;
  title: string | null;
  intro: string;
  items: LexedItem[];
};

const isDirectiveName = (name: string): name is DirectiveName =>
  (DIRECTIVES as readonly string[]).includes(name);

const isBlank = (line: string) => line.trim() === '';

const isItemStart = (line: string) =>
  line.startsWith('## ') || INCLUDE_LINE.test(line.trim());

/** The lines without their leading and trailing blank lines. */
const trimBlankLines = (lines: readonly string[]): string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start] ?? '')) start += 1;
  while (end > start && isBlank(lines[end - 1] ?? '')) end -= 1;
  return lines.slice(start, end);
};

function lexBlocks(lines: readonly string[]): LexedBlock[] {
  const blocks: LexedBlock[] = [];
  let text: string[] = [];
  let practices: Practice[] | undefined;
  const flushText = () => {
    const kept = trimBlankLines(text);
    if (kept.length > 0) blocks.push({ kind: 'text', text: kept.join('\n') });
    text = [];
  };
  for (const line of lines) {
    const practice = PRACTICE_LINE.exec(line.trim());
    if (practice?.[1] !== undefined && practice[2] !== undefined) {
      flushText();
      if (practices === undefined) {
        practices = [];
        blocks.push({ kind: 'practices', items: practices });
      }
      practices.push({
        kind: practice[1].toLowerCase() === 'do' ? 'do' : 'avoid',
        text: practice[2],
      });
    } else if (isBlank(line) && practices !== undefined) {
      // Blank lines between cards keep them in one group.
      continue;
    } else {
      practices = undefined;
      text.push(line);
    }
  }
  flushText();
  return blocks;
}

const fail = (lineIndex: number, message: string): never => {
  throw new Error(`Line ${lineIndex + 1}: ${message}`);
};

/** Reads a walkthrough content file (or a shared file) into its parts. */
export function lexWalkthrough(source: string): LexedFile {
  const lines = source.split(/\r?\n/);

  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  const firstItem = lines.findIndex(isItemStart);
  const hasTitle =
    titleIndex !== -1 && (firstItem === -1 || titleIndex < firstItem);
  const headEnd = hasTitle
    ? titleIndex
    : firstItem === -1
      ? lines.length
      : firstItem;
  const title = hasTitle ? (lines[titleIndex] ?? '').slice(2).trim() : null;

  let index = hasTitle ? headEnd + 1 : headEnd;
  const intro: string[] = [];
  while (index < lines.length && !isItemStart(lines[index] ?? '')) {
    intro.push(lines[index] ?? '');
    index += 1;
  }

  const items: LexedItem[] = [];
  let step:
    | { title: string; directives: Directive[]; body: string[] }
    | undefined;
  const finishStep = () => {
    if (step === undefined) return;
    items.push({
      type: 'step',
      title: step.title,
      directives: step.directives,
      blocks: lexBlocks(step.body),
    });
    step = undefined;
  };

  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('## ')) {
      finishStep();
      step = { title: line.slice(3).trim(), directives: [], body: [] };
      continue;
    }
    const include = INCLUDE_LINE.exec(line.trim());
    if (include?.[1] !== undefined) {
      finishStep();
      items.push({ type: 'include', name: include[1] });
      continue;
    }
    if (step === undefined) {
      if (!isBlank(line)) {
        fail(
          index,
          `text after an include belongs to no step; start a step with "## " first: "${line.trim()}"`,
        );
      }
      continue;
    }
    const directive = DIRECTIVE_LINE.exec(line.trim());
    const name = directive?.[1];
    const value = directive?.[2];
    if (name === undefined || value === undefined || !isDirectiveName(name)) {
      step.body.push(line);
      continue;
    }
    if (!step.body.every(isBlank)) {
      fail(
        index,
        `the "${name}:" directive in step "${step.title}" comes after the step's text; move it to the top of the step.`,
      );
    }
    if (value === '') {
      fail(index, `the "${name}:" directive in step "${step.title}" is empty.`);
    }
    if (step.directives.some((existing) => existing.name === name)) {
      fail(
        index,
        `step "${step.title}" has more than one "${name}:" directive.`,
      );
    }
    step.directives.push({ name, value });
  }
  finishStep();

  return {
    preamble: trimBlankLines(lines.slice(0, headEnd)).join('\n'),
    title,
    intro: trimBlankLines(intro).join('\n'),
    items,
  };
}

/**
 * The steps of a lexed content file, with each include replaced by the steps
 * of the shared file it names.
 */
export function stepsWithIncludes(
  file: LexedFile,
  shared: (name: string) => LexedFile | undefined,
): LexedStep[] {
  return file.items.flatMap((item) => {
    if (item.type === 'step') return [item];
    const included = shared(item.name);
    if (included === undefined) {
      throw new Error(`Includes unknown shared steps "${item.name}".`);
    }
    return included.items.map((sharedItem) => {
      if (sharedItem.type === 'include') {
        throw new Error(
          `Shared steps "${item.name}" include "${sharedItem.name}"; shared steps cannot include other shared steps.`,
        );
      }
      return sharedItem;
    });
  });
}

/** The names of the shared files a lexed file includes. */
export const includedNames = (file: LexedFile): string[] => [
  ...new Set(
    file.items.flatMap((item) => (item.type === 'include' ? [item.name] : [])),
  ),
];
