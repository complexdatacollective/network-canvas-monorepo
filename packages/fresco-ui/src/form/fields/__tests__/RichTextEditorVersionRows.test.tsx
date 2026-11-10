import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';

import { withSafeTypingIntoRichText } from '../../../testing/withSafeTypingIntoRichText';
import RichTextEditorField, { hasVersionRowBeside } from '../RichTextEditor';

/*
 * The rows the arrow keys stop at among the versions of a field whose whole
 * message is a choice. Worked out here from the message alone, so that the
 * answer does not come from the page the editor draws:
 *
 * - a version holding words (text, a value, or a choice among words) is a row;
 * - a version that is nothing but another choice is a frame: the rows of that
 *   choice are the ones to stop at, listed open in its place;
 * - a choice among words folds to a pill. Its versions stay mounted, hidden,
 *   and are not rows until the pill is opened.
 *
 * They read top to bottom in the order of the message.
 */

type Choice = { versions: Version[] };
type Version = { content: Item[] };
type Item = 'text' | 'value' | Choice;

const isChoice = (item: Item): item is Choice => typeof item === 'object';

type Expected = {
  /** The rows, in reading order, by accessible name. */
  rows: string[];
  /** The frames, which are listed but are not places to stop. */
  frames: string[];
};

type Built = { json: JSONContent; expected: Expected };

/** The editor's JSON for a choice, with the rows that come of it. */
const buildChoice = (
  choice: Choice,
  id: string,
  path: readonly string[],
  expected: Expected,
  open: boolean,
): JSONContent => ({
  type: 'versions',
  attrs: {
    label: `Choice ${id}`,
    summary: `Pill ${id}`,
    versions: choice.versions.map((version, at) => {
      // Named by their place, so that a message that changes keeps the
      // versions it shares with the one before.
      const label = `${id}.${at + 1}`;
      const here = [...path, label];
      const name = here.join(', ');
      const [only] = version.content;
      const isFrame =
        version.content.length === 1 && only !== undefined && isChoice(only);
      if (open) {
        if (isFrame) expected.frames.push(name);
        else expected.rows.push(name);
      }
      return {
        key: label,
        label,
        content: version.content.flatMap((item, position): JSONContent[] => {
          if (item === 'text') return [{ type: 'text', text: 'Add ' }];
          if (item === 'value')
            return [{ type: 'token', attrs: { id: 'name' } }];
          // A choice that is the whole of its version is listed open (when
          // the version is); one among other items folds to a pill.
          return [
            buildChoice(
              item,
              `${label}-${position + 1}`,
              here,
              expected,
              isFrame ? open : false,
            ),
          ];
        }),
      };
    }),
  },
});

const build = (root: Choice): Built => {
  const expected: Expected = { rows: [], frames: [] };
  const choice = buildChoice(root, 'C', [], expected, true);
  return {
    json: { type: 'doc', content: [{ type: 'paragraph', content: [choice] }] },
    expected,
  };
};

/** A small deterministic generator, so that the shapes are the same each run. */
const generator = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % below;
  };
};

const MAX_DEPTH = 3;

const shapes = (count: number): Choice[] => {
  const next = generator(20241110);
  const choice = (depth: number): Choice => ({
    versions: Array.from({ length: 1 + next(3) }, () => version(depth)),
  });
  const version = (depth: number): Version => {
    const kinds = depth < MAX_DEPTH ? 7 : 4;
    switch (next(kinds)) {
      case 0:
        return { content: [] };
      case 1:
        return { content: ['text'] };
      case 2:
        return { content: ['text', 'value'] };
      case 3:
        return { content: ['value'] };
      case 4:
        return { content: ['text', choice(depth + 1)] };
      case 5:
        return { content: [choice(depth + 1), 'text'] };
      default:
        return { content: [choice(depth + 1)] };
    }
  };
  return Array.from({ length: count }, () => choice(1));
};

const words = (...content: Item[]): Version => ({ content });

/**
 * Shapes that went wrong, kept by name as well as being among the generated
 * ones: a row of words that holds a folded choice whose version is itself
 * only another choice, below a first row.
 */
const NAMED_SHAPES: Choice[] = [
  {
    versions: [
      words('text'),
      words('text', {
        versions: [words({ versions: [words(), words('text')] })],
      }),
    ],
  },
  {
    versions: [words('text'), words('text', { versions: [words(), words()] })],
  },
  {
    versions: [words('text', { versions: [words(), words()] }), words('text')],
  },
];

const GENERATED = 30;

const FIELD_NAME = 'Minimum not reached';

const fieldFor = (json: JSONContent) => (
  <RichTextEditorField
    id="rows"
    name="rows"
    aria-label={FIELD_NAME}
    singleLine
    versions
    openWholeMessageVersions
    tokens={[{ id: 'name', label: 'Name', inToolbar: false }]}
    changeMode="input"
    value={json}
    onChange={() => undefined}
  />
);

/** Puts the caret where the arrow keys leave a row. */
const placeCaret = (row: HTMLElement, at: 'start' | 'end') => {
  // Tiptap keeps each editor on the element it draws.
  const { editor } = row as HTMLElement & { editor?: Editor };
  if (!editor) throw new Error('The row has no editor.');
  row.focus();
  editor.commands.setTextSelection(
    at === 'start' ? 1 : editor.state.doc.content.size - 1,
  );
};

/** Two frames: the editor moves focus a frame after the key, when it does. */
const framesPass = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Focus ends on `row` and stays there, so a late move is caught too. */
const focusSettlesOn = async (row: HTMLElement) => {
  await waitFor(() => expect(row).toHaveFocus());
  await framesPass();
  expect(row).toHaveFocus();
};

const visibleTextboxNames = () =>
  screen
    .getAllByRole('textbox')
    .map((each) => each.getAttribute('aria-label') ?? '')
    .filter((name) => name !== FIELD_NAME);

/** Asserts that the page's rows are the expected ones, and that the keys walk them. */
const expectRowsToBeWalked = async (
  user: ReturnType<typeof userEvent.setup>,
  expected: Expected,
) => {
  // (iii) The rows and frames on show are exactly the expected ones: every
  // visible row that holds words is one to stop at, and nothing hidden is.
  await waitFor(() =>
    expect(visibleTextboxNames().toSorted()).toEqual(
      [...expected.rows, ...expected.frames].toSorted(),
    ),
  );

  const rows = expected.rows.map((name) =>
    screen.getByRole('textbox', { name }),
  );
  // Reading order is the order in the page.
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (previous)
      expect(
        previous.compareDocumentPosition(row) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });

  // (ii) The first row has nothing above it, the last nothing below.
  rows.forEach((row, index) => {
    expect(hasVersionRowBeside(row, -1)).toBe(index > 0);
    expect(hasVersionRowBeside(row, 1)).toBe(index < rows.length - 1);
  });

  // Neither a frame nor a hidden row is somewhere to step from or to.
  screen
    .getAllByRole('textbox', { hidden: true })
    .filter((each) => !rows.includes(each))
    .forEach((each) => {
      expect(hasVersionRowBeside(each, -1)).toBe(false);
      expect(hasVersionRowBeside(each, 1)).toBe(false);
    });

  // (i) The keys land on the neighbouring row, or leave focus where it is
  // when there is none.
  for (const [index, row] of rows.entries()) {
    placeCaret(row, 'end');
    await user.keyboard('{ArrowDown}');
    await focusSettlesOn(rows[index + 1] ?? row);

    placeCaret(row, 'start');
    await user.keyboard('{ArrowUp}');
    await focusSettlesOn(rows[index - 1] ?? row);
  }
};

describe('the rows the arrow keys stop at', () => {
  const all = [...NAMED_SHAPES, ...shapes(GENERATED)];

  it.each(all.map((shape, index) => [index, shape] as const))(
    'are exactly the visible rows that hold words, whatever the message (shape %i)',
    async (_index, shape) => {
      const { json, expected } = build(shape);
      const user = withSafeTypingIntoRichText(userEvent.setup());
      render(fieldFor(json));
      await screen.findAllByRole('textbox', { name: expected.rows[0] });

      await expectRowsToBeWalked(user, expected);
    },
  );

  it.each(all.map((shape, index) => [index, shape] as const))(
    'are still those after the message changes to another (shape %i)',
    async (index, shape) => {
      const before = build(all[(index + 1) % all.length] ?? shape);
      const after = build(shape);
      const user = withSafeTypingIntoRichText(userEvent.setup());
      const view = render(fieldFor(before.json));
      await screen.findAllByRole('textbox', { name: before.expected.rows[0] });

      view.rerender(fieldFor(after.json));
      await screen.findAllByRole('textbox', { name: after.expected.rows[0] });

      await expectRowsToBeWalked(user, after.expected);
    },
  );
});
