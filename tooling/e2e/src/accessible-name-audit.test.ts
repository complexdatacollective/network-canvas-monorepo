import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  expectNoUnnamedControls,
  findUnnamedControls,
  type KnownUnnamedControl,
} from './accessible-name-audit.ts';

/**
 * Every line below is a real line lifted from a committed ARIA baseline, or that
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
    await expectNoUnnamedControls(main, 'no-such-key', []);
    expect(main.calls).toBe(1);
  });

  it('fails on an unnamed control that has a value', async () => {
    vi.useFakeTimers();
    const main = source('- main:\n  - textbox: Teacher');
    const error = await settle(
      expectNoUnnamedControls(main, 'no-such-key', []),
    );
    expect(String(error)).toContain('observed unnamed controls: [textbox]');
    expect(String(error)).toContain('gained NO accessible name');
  });

  it('reports every unnamed control, including a flagged control with a value', async () => {
    vi.useFakeTimers();
    const main = source('- main:\n  - button\n  - textbox [invalid]: Teacher');
    const error = await settle(
      expectNoUnnamedControls(main, 'no-such-key', []),
    );
    expect(String(error)).toContain(
      'observed unnamed controls: [button, textbox]',
    );
    expect(String(error)).toContain(
      'gained NO accessible name: button, textbox',
    );
  });

  it('polls, so a label that renders a tick late is not a flake', async () => {
    vi.useFakeTimers();
    const main = source(
      '- main:\n  - textbox: Teacher',
      '- main:\n  - textbox "Occupation": Teacher',
    );
    const settled = expectNoUnnamedControls(main, 'no-such-key', []).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await settled).toBe('resolved');
    expect(main.calls).toBe(2);
  });

  describe('the known-unnamed allowlist', () => {
    const known: KnownUnnamedControl[] = [
      {
        key: 'slug-initial',
        roles: ['button'],
        reason: 'The icon button has no label yet.',
        issue:
          'https://github.com/complexdatacollective/network-canvas-monorepo/issues/1',
      },
      {
        key: 'slug-final',
        roles: ['textbox', 'textbox'],
        reason: 'Two unlabeled inputs.',
      },
      { key: 'slug-final', roles: ['button'], reason: 'Same subject, again.' },
    ];

    it('passes when the observed roles equal the recorded ones exactly', async () => {
      const main = source('- main:\n  - button\n  - button "Named"');
      await expectNoUnnamedControls(main, 'slug-initial', known);
      expect(main.calls).toBe(1);
    });

    it('gathers the roles of every entry recorded for a key', async () => {
      const main = source(
        '- main:\n  - textbox\n  - button\n  - textbox: value',
      );
      await expectNoUnnamedControls(main, 'slug-final', known);
    });

    it('fails on a NEW unnamed control beside a recorded one', async () => {
      vi.useFakeTimers();
      const main = source('- main:\n  - button\n  - button');
      const error = await settle(
        expectNoUnnamedControls(main, 'slug-initial', known),
      );
      expect(String(error)).toContain('recorded for this subject: [button]');
      expect(String(error)).toContain('gained NO accessible name: button');
    });

    it('fails when a recorded violation no longer reproduces (stale entry)', async () => {
      vi.useFakeTimers();
      const main = source('- main:\n  - button "Fixed now"');
      const error = await settle(
        expectNoUnnamedControls(main, 'slug-initial', known),
      );
      expect(String(error)).toContain('no longer reproduce: button');
      expect(String(error)).not.toContain('gained NO accessible name');
    });

    it('does not apply one key’s entries to another', async () => {
      vi.useFakeTimers();
      const main = source('- main:\n  - button');
      const error = await settle(
        expectNoUnnamedControls(main, 'some-other-key', known),
      );
      expect(String(error)).toContain('gained NO accessible name: button');
    });
  });
});
