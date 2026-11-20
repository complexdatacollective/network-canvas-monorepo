import { describe, expect, it } from 'vitest';

import {
  hasWalkthrough,
  loadWalkthrough,
  parseWalkthrough,
} from '../parseWalkthrough';
import { lexWalkthrough } from '../walkthroughFormat';

const NO_SHARED = new Map<string, string>();

describe('parseWalkthrough', () => {
  it('reads the title, steps, directives and text', () => {
    const walkthrough = parseWalkthrough(
      [
        '<!-- An authors note. -->',
        '',
        '# Information',
        '',
        'An introduction the panel does not show.',
        '',
        '## Write the heading',
        '',
        '<!-- section: Page content -->',
        '<!-- field: title -->',
        '<!-- scene: information-blocks -->',
        '',
        'The **Page heading** is required.',
        '',
        '## Try it',
        '<!-- control: preview -->',
        'Use Preview.',
      ].join('\n'),
      NO_SHARED,
    );
    expect(walkthrough).toEqual({
      title: 'Information',
      steps: [
        {
          title: 'Write the heading',
          section: 'Page content',
          field: 'title',
          scene: 'information-blocks',
          blocks: [
            { kind: 'markdown', text: 'The **Page heading** is required.' },
          ],
        },
        {
          title: 'Try it',
          control: 'preview',
          blocks: [{ kind: 'markdown', text: 'Use Preview.' }],
        },
      ],
    });
  });

  it('refuses a step with two directives of the same name', () => {
    expect(() =>
      parseWalkthrough(
        '# T\n\n## One\n\n<!-- scene: a -->\n<!-- scene: b -->\n\nText.\n',
        NO_SHARED,
      ),
    ).toThrow(/Line 6: step "One" has more than one "scene:" directive/);
  });

  it('refuses a directive after the step’s text', () => {
    expect(() =>
      parseWalkthrough(
        '# T\n\n## One\n\nText.\n\n<!-- section: Prompts -->\n',
        NO_SHARED,
      ),
    ).toThrow(/Line 7: .*comes after the step's text/);
  });

  it('accepts directives separated by blank lines at the top of a step', () => {
    const { steps } = parseWalkthrough(
      '# T\n\n## One\n\n<!-- section: Prompts -->\n\n<!-- scene: a -->\n\nText.\n',
      NO_SHARED,
    );
    expect(steps[0]).toMatchObject({ section: 'Prompts', scene: 'a' });
  });

  it('refuses an empty directive', () => {
    expect(() =>
      parseWalkthrough('# T\n\n## One\n\n<!-- scene: -->\n', NO_SHARED),
    ).toThrow(/"scene:" directive in step "One" is empty/);
  });

  it('keeps a comment naming an unknown directive as text', () => {
    const { steps } = parseWalkthrough(
      '# T\n\n## One\n\n<!-- dialog: edit prompt -->\n\nText.\n',
      NO_SHARED,
    );
    expect(steps[0]).toEqual({
      title: 'One',
      blocks: [
        { kind: 'markdown', text: '<!-- dialog: edit prompt -->\n\nText.' },
      ],
    });
  });

  it('groups do and avoid cards across the blank lines between them', () => {
    const { steps } = parseWalkthrough(
      [
        '# T',
        '## One',
        'Before.',
        '',
        '> Do: First.',
        '',
        '',
        '> Avoid: Second.',
        '> do: Third.',
        '',
        'Between.',
        '',
        '> Avoid: Fourth.',
      ].join('\n'),
      NO_SHARED,
    );
    expect(steps[0]?.blocks).toEqual([
      { kind: 'markdown', text: 'Before.' },
      {
        kind: 'practices',
        items: [
          { kind: 'do', text: 'First.' },
          { kind: 'avoid', text: 'Second.' },
          { kind: 'do', text: 'Third.' },
        ],
      },
      { kind: 'markdown', text: 'Between.' },
      { kind: 'practices', items: [{ kind: 'avoid', text: 'Fourth.' }] },
    ]);
  });

  it('splices the steps of an included shared file in place', () => {
    const shared = new Map([
      [
        'skip-logic',
        '<!--\n  A note.\n-->\n\n## Skip\n\n<!-- section: Skip logic -->\n\nSkip text.\n',
      ],
    ]);
    const { steps } = parseWalkthrough(
      '# T\n\n## First\n\nOne.\n\n<!-- include: skip-logic -->\n\n## Last\n\nTwo.\n',
      shared,
    );
    expect(steps.map((step) => step.title)).toEqual(['First', 'Skip', 'Last']);
    expect(steps[1]).toMatchObject({ section: 'Skip logic' });
    // The include ends "First": its text does not run on into the next step.
    expect(steps[0]?.blocks).toEqual([{ kind: 'markdown', text: 'One.' }]);
  });

  it('ends a step at an include inside it', () => {
    const shared = new Map([['preview', '## Preview\n\nPreview text.\n']]);
    const { steps } = parseWalkthrough(
      '# T\n\n## First\n\nOne.\n<!-- include: preview -->\n',
      shared,
    );
    expect(steps).toEqual([
      { title: 'First', blocks: [{ kind: 'markdown', text: 'One.' }] },
      {
        title: 'Preview',
        blocks: [{ kind: 'markdown', text: 'Preview text.' }],
      },
    ]);
  });

  it('refuses text after an include that belongs to no step', () => {
    const shared = new Map([['preview', '## Preview\n\nText.\n']]);
    expect(() =>
      parseWalkthrough(
        '# T\n\n<!-- include: preview -->\n\nStray text.\n',
        shared,
      ),
    ).toThrow(/Line 5: text after an include belongs to no step/);
  });

  it('keeps the first step of a shared file that starts with it', () => {
    const shared = new Map([
      ['two', '## First shared\n\nOne.\n\n## Second shared\n\nTwo.\n'],
    ]);
    const { steps } = parseWalkthrough(
      '# T\n\n<!-- include: two -->\n',
      shared,
    );
    expect(steps.map((step) => step.title)).toEqual([
      'First shared',
      'Second shared',
    ]);
  });

  it('drops the authors’ note above a shared file’s first step', () => {
    const shared = new Map([
      [
        'noted',
        '<!--\n  Shared step. Include with "include: noted".\n-->\n\n## Shared\n\nText.\n',
      ],
    ]);
    const { steps } = parseWalkthrough('# T\n<!-- include: noted -->', shared);
    expect(steps).toEqual([
      { title: 'Shared', blocks: [{ kind: 'markdown', text: 'Text.' }] },
    ]);
  });

  it('throws for an include of an unknown shared file', () => {
    expect(() =>
      parseWalkthrough('# T\n\n<!-- include: missing -->\n', NO_SHARED),
    ).toThrow('Includes unknown shared steps "missing".');
  });

  it('refuses a shared file that includes another', () => {
    const shared = new Map([
      ['outer', '## Outer\n\nText.\n\n<!-- include: inner -->\n'],
      ['inner', '## Inner\n\nText.\n'],
    ]);
    expect(() =>
      parseWalkthrough('# T\n\n<!-- include: outer -->\n', shared),
    ).toThrow(/shared steps cannot include other shared steps/);
  });

  it('names the shared file a format error is in', () => {
    const shared = new Map([
      ['broken', '## Broken\n\nText.\n\n<!-- scene: late -->\n'],
    ]);
    expect(() =>
      parseWalkthrough('# T\n\n<!-- include: broken -->\n', shared),
    ).toThrow(/^shared\/broken\.md: Line 5:/);
  });

  it('reads a title only above the first step', () => {
    expect(lexWalkthrough('## Step\n\n# Not a title\n').title).toBeNull();
  });
});

describe('loadWalkthrough', () => {
  it('loads a stage type once and returns the same promise after', async () => {
    const first = loadWalkthrough('Information');
    expect(loadWalkthrough('Information')).toBe(first);
    expect((await first)?.title).toBe('Information');
  });

  it('resolves to undefined for a stage type with no walkthrough', async () => {
    expect(hasWalkthrough('NotAStageType')).toBe(false);
    await expect(loadWalkthrough('NotAStageType')).resolves.toBeUndefined();
  });
});
