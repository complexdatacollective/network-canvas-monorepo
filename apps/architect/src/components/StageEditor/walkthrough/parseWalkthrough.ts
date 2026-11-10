export type Practice = Readonly<{ kind: 'do' | 'avoid'; text: string }>;

export type WalkthroughBlock =
  | Readonly<{ kind: 'markdown'; text: string }>
  | Readonly<{ kind: 'practices'; items: readonly Practice[] }>;

export type WalkthroughStep = Readonly<{
  title: string;
  blocks: readonly WalkthroughBlock[];
  section?: string;
  field?: string;
  scene?: string;
  /** Shown only while a dialog whose title contains this text is open. */
  dialog?: string;
}>;

export type Walkthrough = Readonly<{
  title: string;
  steps: readonly WalkthroughStep[];
}>;

const DIRECTIVES = ['section', 'field', 'scene', 'dialog'] as const;
type Directive = (typeof DIRECTIVES)[number];

const isDirective = (value: string): value is Directive =>
  (DIRECTIVES as readonly string[]).includes(value);

const DIRECTIVE = new RegExp(
  `^<!--\\s*(${DIRECTIVES.join('|')}):\\s*(.*?)\\s*-->$`,
);
const CALLOUT = /^>\s*(Do|Avoid):\s*(.*)$/i;

function parseBlocks(lines: readonly string[]): WalkthroughBlock[] {
  const blocks: WalkthroughBlock[] = [];
  let markdown: string[] = [];
  let practices: Practice[] = [];
  const flushMarkdown = () => {
    const text = markdown.join('\n').trim();
    if (text !== '') blocks.push({ kind: 'markdown', text });
    markdown = [];
  };
  const flushPractices = () => {
    if (practices.length > 0)
      blocks.push({ kind: 'practices', items: practices });
    practices = [];
  };
  for (const line of lines) {
    const callout = CALLOUT.exec(line.trim());
    if (callout?.[1] !== undefined && callout[2] !== undefined) {
      flushMarkdown();
      practices.push({
        kind: callout[1].toLowerCase() === 'do' ? 'do' : 'avoid',
        text: callout[2],
      });
    } else if (line.trim() === '' && practices.length > 0) {
      continue;
    } else {
      flushPractices();
      markdown.push(line);
    }
  }
  flushMarkdown();
  flushPractices();
  return blocks;
}

function parseWalkthrough(source: string): Walkthrough {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('# '));
  const title = start === -1 ? '' : (lines[start]?.slice(2).trim() ?? '');

  const steps: WalkthroughStep[] = [];
  let current:
    | { title: string; lines: string[]; directives: Map<Directive, string> }
    | undefined;
  const push = () => {
    if (current === undefined) return;
    const directives = Object.fromEntries(current.directives) as Partial<
      Record<Directive, string>
    >;
    steps.push({
      title: current.title,
      blocks: parseBlocks(current.lines),
      ...directives,
    });
  };

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) {
      push();
      current = {
        title: line.slice(3).trim(),
        lines: [],
        directives: new Map(),
      };
      continue;
    }
    if (current === undefined) continue;
    const directive = DIRECTIVE.exec(line.trim());
    const name = directive?.[1];
    if (
      name !== undefined &&
      isDirective(name) &&
      directive?.[2] !== undefined
    ) {
      current.directives.set(name, directive[2]);
    } else {
      current.lines.push(line);
    }
  }
  push();

  return { title, steps };
}

const sources = import.meta.glob<string>('./content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const sharedSources = import.meta.glob<string>('./content/shared/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const shared = new Map(
  Object.entries(sharedSources).map(([path, source]) => [
    path.replace(/^\.\/content\/shared\/(.*)\.md$/, '$1'),
    source.slice(Math.max(0, source.indexOf('\n## ') + 1)),
  ]),
);

const INCLUDE = /^<!--\s*include:\s*(.*?)\s*-->$/;

/** The source with each include line replaced by that shared file's steps. */
const withIncludes = (source: string) =>
  source
    .split(/\r?\n/)
    .map((line) => {
      const name = INCLUDE.exec(line.trim())?.[1];
      if (name === undefined) return line;
      const steps = shared.get(name);
      if (steps === undefined) {
        throw new Error(`Walkthrough includes unknown shared steps "${name}"`);
      }
      return steps;
    })
    .join('\n');

const walkthroughs = new Map(
  Object.entries(sources).map(([path, source]) => [
    path.replace(/^\.\/content\/(.*)\.md$/, '$1'),
    parseWalkthrough(withIncludes(source)),
  ]),
);

export const walkthroughFor = (stageType: string): Walkthrough | undefined =>
  walkthroughs.get(stageType);
