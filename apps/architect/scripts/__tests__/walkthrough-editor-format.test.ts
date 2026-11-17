import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DIRECTIVES,
  parse,
  problems,
  serialize,
} from '../walkthrough-editor/format.mjs';
import { sceneNamesIn } from '../walkthrough-editor/sceneNames.mjs';

// The walkthrough editor saves a file by rebuilding it from its parsed form,
// so every content file must come back unchanged: otherwise saving one step
// would rewrite parts of the file nobody touched.
const content = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/components/StageEditor/walkthrough/content',
);

const files = [
  ...readdirSync(content).filter((name) => name.endsWith('.md')),
  ...readdirSync(join(content, 'shared'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `shared/${name}`),
];

describe('walkthrough editor format', () => {
  it.each(files)('%s survives parse and serialize unchanged', (file) => {
    const source = readFileSync(join(content, file), 'utf8');
    expect(serialize(parse(source))).toBe(source);
  });

  // A directive the walkthrough does not know, such as the retired "dialog:",
  // would be read as step text and shown as nothing.
  it.each(files)('%s uses only known directives', (file) => {
    const doc = parse(readFileSync(join(content, file), 'utf8'));
    const stray = doc.items.flatMap((item) =>
      item.type === 'step'
        ? item.blocks.flatMap((block) =>
            block.text
              .split('\n')
              .filter((line) => /^<!--\s*[a-z]+:/.test(line.trim())),
          )
        : [],
    );
    expect(stray).toEqual([]);
    for (const item of doc.items) {
      if (item.type !== 'step') continue;
      for (const directive of item.directives) {
        expect(DIRECTIVES).toContain(directive.name);
      }
    }
  });

  it('reads a retired dialog directive as text, not a directive', () => {
    const doc = parse('# T\n\n## One\n\n<!-- dialog: edit prompt -->\n');
    expect(doc.items[0]).toMatchObject({
      directives: [],
      blocks: [{ type: 'text', text: '<!-- dialog: edit prompt -->' }],
    });
  });

  it('writes edits in the content files’ own layout', () => {
    const doc = parse('# T\n\n## One\n\n<!-- scene: a -->\n\nBody.\n');
    const step = doc.items[0];
    if (step?.type !== 'step') throw new Error('Expected a step');
    step.blocks.push({ type: 'avoid', text: 'Doing it wrong.' });
    step.directives.push({ name: 'field', value: '' });
    doc.items.push({ type: 'include', name: 'preview' });
    expect(serialize(doc)).toBe(
      '# T\n\n## One\n\n<!-- scene: a -->\n\nBody.\n\n> Avoid: Doing it wrong.\n\n<!-- include: preview -->\n',
    );
  });

  it('keeps the directives on a step separate from its text', () => {
    const doc = parse(
      '# T\n\n## One\n\n<!-- section: Prompts -->\n<!-- field: prompts -->\n\nText.\n\n> Do: This.\n\nMore text.\n',
    );
    expect(doc.items[0]).toEqual({
      type: 'step',
      title: 'One',
      directives: [
        { name: 'section', value: 'Prompts' },
        { name: 'field', value: 'prompts' },
      ],
      blocks: [
        { type: 'text', text: 'Text.' },
        { type: 'do', text: 'This.' },
        { type: 'text', text: 'More text.' },
      ],
    });
  });

  it('refuses a file the app would refuse', () => {
    expect(() =>
      parse('# T\n\n## One\n\n<!-- scene: a -->\n<!-- scene: b -->\n'),
    ).toThrow(/more than one "scene:" directive/);
    expect(() =>
      parse('# T\n\n## One\n\nText.\n\n<!-- scene: a -->\n'),
    ).toThrow(/comes after the step's text/);
  });

  it('keeps each card its own block, in a group the app shows together', () => {
    const doc = parse('# T\n\n## One\n\n> Do: A.\n\n> Avoid: B.\n');
    expect(doc.items[0]).toMatchObject({
      blocks: [
        { type: 'do', text: 'A.' },
        { type: 'avoid', text: 'B.' },
      ],
    });
  });

  it('flags what a saved file could not say', () => {
    const doc = parse('# T\n\n## One\n\nText.\n');
    const step = doc.items[0];
    if (step?.type !== 'step') throw new Error('Expected a step');
    step.blocks.push({ type: 'text', text: '<!-- scene: typed -->' });
    step.directives.push({ name: 'control', value: 'nowhere' });
    expect(
      problems(doc, { scenes: [], shared: [] }).map(({ message }) => message),
    ).toEqual([
      'No control called "nowhere". Known controls: preview.',
      'A heading, directive or include in the text. Use the fields and buttons for those instead.',
    ]);
  });
});

describe('scene names', () => {
  it('reads the keys of a SCENES object', () => {
    expect(
      sceneNamesIn(
        "import { A } from './A';\nexport const SCENES: Record<string, C> = {\n  'a-one': A,\n  \"b\": lazy(() => import('./B')),\n};\n",
      ),
    ).toEqual(['a-one', 'b']);
  });

  it('prefers a SCENE_NAMES array', () => {
    expect(
      sceneNamesIn(
        "type Name = (typeof SCENE_NAMES)[number];\nexport const SCENE_NAMES: readonly string[] = [\n  'a-one',\n  'b',\n] as const;\nconst SCENES = {\n  'c': C,\n};\n",
      ),
    ).toEqual(['a-one', 'b']);
  });
});
