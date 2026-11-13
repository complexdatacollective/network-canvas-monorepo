import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parse, serialize } from '../walkthrough-editor/format.mjs';

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
});
