import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseWalkthrough } from '../../src/components/StageEditor/walkthrough/parseWalkthrough';
import { parse } from '../walkthrough-editor/format.mjs';

// The editor shows a file as the app will play it: the same steps, pointing at
// the same places, with the same do / avoid cards. Both read files through
// walkthroughFormat.ts; this checks the shapes each builds from it agree.

const content = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/components/StageEditor/walkthrough/content',
);
const markdownIn = (folder: string) =>
  readdirSync(folder).filter((name) => name.endsWith('.md'));

const shared = new Map(
  markdownIn(join(content, 'shared')).map((name) => [
    name.slice(0, -'.md'.length),
    readFileSync(join(content, 'shared', name), 'utf8'),
  ]),
);

type Summary = {
  title: string;
  directives: Record<string, string>;
  practices: Array<Array<{ kind: string; text: string }>>;
};

/** The steps as the editor holds them, with includes expanded. */
function editorSteps(source: string): Summary[] {
  return parse(source).items.flatMap((item) => {
    if (item.type === 'include') {
      const included = shared.get(item.name);
      if (included === undefined) throw new Error(`No ${item.name}`);
      return editorSteps(included);
    }
    // The editor's preview groups cards the way the panel does: a run of
    // do / avoid blocks, ignoring empty blocks, is one group.
    const practices: Summary['practices'] = [];
    let group: Summary['practices'][number] | undefined;
    for (const block of item.blocks) {
      if (block.text.trim() === '') continue;
      if (block.type === 'text') {
        group = undefined;
        continue;
      }
      if (group === undefined) {
        group = [];
        practices.push(group);
      }
      group.push({ kind: block.type, text: block.text });
    }
    return [
      {
        title: item.title,
        directives: Object.fromEntries(
          item.directives.map(({ name, value }) => [name, value]),
        ),
        practices,
      },
    ];
  });
}

/** The steps as the app plays them. */
function appSteps(source: string): Summary[] {
  return parseWalkthrough(source, shared).steps.map(
    ({ title, blocks, section, field, control, scene }) => ({
      title,
      directives: Object.fromEntries(
        Object.entries({ section, field, control, scene }).flatMap(
          ([name, value]) =>
            value === undefined ? [] : [[name, value] as const],
        ),
      ),
      practices: blocks.flatMap((block) =>
        block.kind === 'practices'
          ? [block.items.map(({ kind, text }) => ({ kind, text }))]
          : [],
      ),
    }),
  );
}

describe('walkthrough editor and app agree', () => {
  it.each(markdownIn(content))('%s', (name) => {
    const source = readFileSync(join(content, name), 'utf8');
    const app = appSteps(source);
    expect(app.length).toBeGreaterThan(0);
    expect(editorSteps(source)).toEqual(app);
  });
});
