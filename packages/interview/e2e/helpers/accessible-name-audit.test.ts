import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  expectNoUnnamedControls,
  findUnnamedControls,
} from './accessible-name-audit.js';

/**
 * Every line below is a real line lifted from `e2e/aria-snapshots/**`, or that
 * line with its accessible name deleted — which is precisely the regression
 * this audit exists to catch. Keeping both twins in one table is what makes the
 * test discriminating: a detector that flags neither, or flags both, fails.
 */
const CONTROL_LINES: readonly {
  line: string;
  /** What the audit must report for this line — `[]` for a compliant node. */
  expected: readonly string[];
  why: string;
}[] = [
  // --- named: must never be flagged -------------------------------------
  { line: '  - button "Add"', expected: [], why: 'plain named control' },
  {
    line: '  - button "Next Step" [disabled]',
    expected: [],
    why: 'named + state flag',
  },
  {
    line: '  - button "Collapse drawer" [expanded]: 1 unplaced',
    expected: [],
    why: 'named + flag + value',
  },
  {
    line: '    - textbox "Occupation": Teacher',
    expected: [],
    why: 'named + value',
  },
  {
    line: '    - textbox "Their name" [invalid]: Bob',
    expected: [],
    why: 'named + flag + value',
  },
  {
    line: '      - slider "Closeness score": "1"',
    expected: [],
    why: 'named + QUOTED value',
  },
  {
    line: `        - slider "How happy are you right now?": '0.5'`,
    expected: [],
    why: 'named + single-quoted value',
  },
  {
    line: '    - spinbutton "Age": /\\d+/',
    expected: [],
    why: 'named + regex value',
  },
  {
    line: '    - textbox /Note \\d+/: value 9',
    expected: [],
    why: 'regex NAME (hand-authored baseline) + value',
  },
  { line: '  - tab "Details":', expected: [], why: 'named + children' },
  {
    line: '  - button "He said \\"hi\\""',
    expected: [],
    why: 'name containing an escaped quote',
  },

  // --- unnamed: must always be flagged ----------------------------------
  { line: '  - button', expected: ['button'], why: 'bare unnamed control' },
  { line: '    - textbox', expected: ['textbox'], why: 'bare unnamed control' },
  {
    line: '  - button [disabled]',
    expected: ['button'],
    why: 'unnamed + state flag',
  },
  { line: '  - tab:', expected: ['tab'], why: 'unnamed + children' },
  // The hole. Playwright writes a control's value on the same line, so every
  // case below is an unnamed control the pre-fix regex passed silently.
  {
    line: '    - textbox: Teacher',
    expected: ['textbox'],
    why: 'UNNAMED + value (the regression this guard exists for)',
  },
  {
    line: '    - textbox [invalid]: Bob',
    expected: ['textbox'],
    why: 'UNNAMED + flag + value',
  },
  {
    line: '      - slider: "1"',
    expected: ['slider'],
    why: 'UNNAMED + quoted value — the value must not be read as a name',
  },
  {
    line: `        - slider: '0.5'`,
    expected: ['slider'],
    why: 'UNNAMED + single-quoted value',
  },
  {
    line: '  - button [expanded]: 1 unplaced',
    expected: ['button'],
    why: 'UNNAMED + flag + value',
  },
  {
    line: '  - combobox: Choose one',
    expected: ['combobox'],
    why: 'UNNAMED combobox with a value',
  },
  {
    line: '  - spinbutton: 42',
    expected: ['spinbutton'],
    why: 'UNNAMED spinbutton with a value',
  },
  {
    line: '  - searchbox: dog',
    expected: ['searchbox'],
    why: 'UNNAMED searchbox with a value',
  },
];

/**
 * Roles whose accessible name is genuinely optional. Every one of these lines
 * is unnamed and most carry a value; none is a WCAG 4.1.2 defect, so the audit
 * must stay silent. All are real shapes from the committed corpus.
 */
const OPTIONAL_NAME_LINES: readonly string[] = [
  '- main:',
  '  - navigation:',
  '  - status:',
  '  - list:',
  '    - listitem: item one',
  '  - text: Name? Legal name',
  '  - paragraph: Some prose',
  '  - group:',
  '  - radiogroup:',
  '  - dialog',
  '  - application:',
  '  - separator',
  '  - img',
  '  - term: Key',
  '  - definition: Value',
  '  - strong: Bold',
  '  - emphasis: Italic',
  '  - progressbar "Progress indicator": x',
  '  - region "Interview notifications"',
];

describe('findUnnamedControls', () => {
  it('has both named and unnamed cases to discriminate', () => {
    // A table of only-compliant (or only-offending) lines would let a detector
    // that never fires (or always fires) pass every case below.
    expect(
      CONTROL_LINES.filter(({ expected }) => expected.length > 0).length,
    ).toBeGreaterThan(5);
    expect(
      CONTROL_LINES.filter(({ expected }) => expected.length === 0).length,
    ).toBeGreaterThan(5);
  });

  it.each(CONTROL_LINES)('$why — "$line"', ({ line, expected }) => {
    expect(findUnnamedControls(line)).toEqual(expected);
  });

  it('ignores roles whose accessible name is optional', () => {
    expect(OPTIONAL_NAME_LINES.length).toBeGreaterThan(0);
    expect(findUnnamedControls(OPTIONAL_NAME_LINES.join('\n'))).toEqual([]);
  });

  it('reports one entry per offending node, duplicates preserved', () => {
    // Three unnamed buttons must not collapse to one, or losing two of them
    // would leave the recorded expectation unchanged.
    const snapshot = [
      '- main:',
      '  - button',
      '  - button "Named"',
      '  - button [disabled]',
      '  - textbox: still here',
      '  - button: 1 unplaced',
    ].join('\n');
    expect(findUnnamedControls(snapshot)).toEqual([
      'button',
      'button',
      'textbox',
      'button',
    ]);
  });

  it('finds nothing in a fully named tree', () => {
    const snapshot = [
      '- main:',
      '  - heading "About You" [level=1]',
      '  - textbox "Name?"',
      '  - button "Decrease value"',
      '  - spinbutton "Age?": 30',
      '  - switch "Alone?"',
      '  - navigation:',
      '    - button "Previous Step"',
      '    - progressbar "Progress indicator": x',
      '    - button "Next Step"',
    ].join('\n');
    expect(findUnnamedControls(snapshot)).toEqual([]);
  });
});

/**
 * The committed baselines are the closest available record of what the live
 * accessibility tree contains, so the audit is run over all of them here. This
 * is the ratchet in unit-test form: it goes red when a regenerated baseline
 * absorbs an operable control that lost its accessible name, without waiting
 * for anyone to run the browser matrix.
 */
describe('committed ARIA baselines', () => {
  const root = resolve(import.meta.dirname, '../aria-snapshots');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  const baselines = walk(root).filter((path) => path.endsWith('.aria.yml'));

  it('has baselines to audit', () => {
    // Without this, an empty or moved corpus would make the assertion below
    // pass while reading nothing.
    expect(baselines.length).toBeGreaterThan(100);
  });

  it('contains exactly the unnamed controls we already know about', () => {
    const found = baselines
      .flatMap((path) => {
        const roles = findUnnamedControls(readFileSync(path, 'utf8'));
        return roles.map((role) => `${path.slice(root.length + 1)}: ${role}`);
      })
      .toSorted();

    expect(found).toEqual([
      // EgoForm's relative date picker: these two baselines are a STALE record.
      // The control carries a name in the live tree (there is deliberately no
      // KNOWN_UNNAMED_CONTROLS entry for it), and a stored bare `- textbox`
      // matches any name, so only this audit would notice a regression. They
      // disappear the next time these two baselines are regenerated.
      'chromium/matrix-ego-form-egoform-field-mega-all-components-initial.aria.yml: textbox',
      'chromium/matrix-ego-form-egoform-relative-date-range-validation-initial.aria.yml: textbox',
      // FamilyPedigree's unlabelled pedigree-canvas control — the same source
      // defect recorded in KNOWN_UNNAMED_CONTROLS. Fix it in the component,
      // then delete it from both places.
      'chromium/matrix-family-pedigree-familypedigree-boundaries-children-contributors-required-final.aria.yml: button',
      'chromium/matrix-family-pedigree-familypedigree-boundaries-grandparents-required-blocked-final.aria.yml: button',
      'chromium/matrix-family-pedigree-familypedigree-checklist-resting-state-final.aria.yml: button',
    ]);
  });
});

describe('expectNoUnnamedControls', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A stand-in for the `main` locator that answers a scripted sequence. */
  const source = (...snapshots: string[]) => {
    let call = 0;
    return {
      ariaSnapshot: () => {
        const snapshot = snapshots[Math.min(call, snapshots.length - 1)] ?? '';
        call += 1;
        return Promise.resolve(snapshot);
      },
      get calls() {
        return call;
      },
    };
  };

  /** Run to rejection under fake timers; resolves to the thrown value. */
  const settle = async (promise: Promise<void>): Promise<unknown> => {
    const settled = promise.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    return settled;
  };

  it('passes a fully named tree without polling', async () => {
    const main = source('- main:\n  - button "Add"\n  - textbox "Name": Alex');
    await expectNoUnnamedControls(main, 'no-such-key');
    expect(main.calls).toBe(1);
  });

  it('fails on an unnamed control that has a value', async () => {
    vi.useFakeTimers();
    const main = source('- main:\n  - textbox: Teacher');
    const error = await settle(expectNoUnnamedControls(main, 'no-such-key'));
    expect(String(error)).toContain('observed unnamed controls: [textbox]');
    expect(String(error)).toContain('gained NO accessible name');
  });

  it('accepts a control recorded in KNOWN_UNNAMED_CONTROLS', async () => {
    // The real ratchet entry, so the test breaks if that key is renamed.
    const main = source('- main:\n  - button\n  - button "Egg Parent"');
    await expectNoUnnamedControls(
      main,
      'matrix-family-pedigree-familypedigree-checklist-resting-state-final',
    );
  });

  it('still fails when a recorded snapshot gains an EXTRA unnamed control', async () => {
    vi.useFakeTimers();
    const main = source('- main:\n  - button\n  - textbox: Teacher');
    const error = await settle(
      expectNoUnnamedControls(
        main,
        'matrix-family-pedigree-familypedigree-checklist-resting-state-final',
      ),
    );
    expect(String(error)).toContain('gained NO accessible name: textbox');
  });

  it('fails when a recorded violation stops reproducing', async () => {
    vi.useFakeTimers();
    const main = source('- main:\n  - button "Now labelled"');
    const error = await settle(
      expectNoUnnamedControls(
        main,
        'matrix-family-pedigree-familypedigree-checklist-resting-state-final',
      ),
    );
    expect(String(error)).toContain('no longer reproduce: button');
  });

  it('polls, so a label that renders a tick late is not a flake', async () => {
    vi.useFakeTimers();
    const main = source(
      '- main:\n  - textbox: Teacher',
      '- main:\n  - textbox "Occupation": Teacher',
    );
    const settled = expectNoUnnamedControls(main, 'no-such-key').then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await settled).toBe('resolved');
    expect(main.calls).toBe(2);
  });
});
