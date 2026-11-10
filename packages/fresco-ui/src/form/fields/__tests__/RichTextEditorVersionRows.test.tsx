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

type Foldable = {
  /** The choice, which a pill stands for until it is opened. */
  id: string;
  /** The choices folded to a pill around it, outermost first. */
  around: string[];
};

type Expected = {
  /** The rows on show, in reading order, by accessible name. */
  rows: string[];
  /** The frames on show, which are listed but are not places to stop. */
  frames: string[];
  /** Every choice among words, whether or not its pill is on show. */
  foldable: Foldable[];
};

type Built = { json: JSONContent; expected: Expected };

/**
 * The editor's JSON for a choice, with the rows that come of it. `visible`
 * is whether the choice is on show; `opened` names the choices among words
 * whose pills have been opened.
 */
const buildChoice = (
  choice: Choice,
  id: string,
  path: readonly string[],
  expected: Expected,
  visible: boolean,
  opened: ReadonlySet<string>,
  around: readonly string[],
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
      if (visible) {
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
          const childId = `${label}-${position + 1}`;
          // A choice that is the whole of its version is listed open (when
          // the version is on show); one among other items is a pill until
          // it is opened.
          if (!isFrame)
            expected.foldable.push({ id: childId, around: [...around] });
          return [
            buildChoice(
              item,
              childId,
              here,
              expected,
              visible && (isFrame || opened.has(childId)),
              opened,
              isFrame ? around : [...around, childId],
            ),
          ];
        }),
      };
    }),
  },
});

const build = (
  root: Choice,
  opened: ReadonlySet<string> = new Set(),
): Built => {
  const expected: Expected = { rows: [], frames: [], foldable: [] };
  const choice = buildChoice(root, 'C', [], expected, true, opened, []);
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

const GENERATED = 16;

const FIELD_NAME = 'Minimum not reached';

const fieldFor = (json: JSONContent) => (
  <>
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
    <button type="button">Elsewhere</button>
  </>
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

/** Reading order is the order in the page. */
const rowsAreListedInOrder = (expected: Expected) => {
  const rows = expected.rows.map((name) =>
    screen.getByRole('textbox', { name }),
  );
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (previous)
      expect(
        previous.compareDocumentPosition(row) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });
};

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
  rowsAreListedInOrder(expected);

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

  describe('with the pills of choices among words opened', () => {
    const isOnShow = (each: Element) =>
      each.isConnected && each.closest('[hidden]') === null;

    const activeEditor = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) throw new Error('No focus.');
      return active;
    };

    /** Opens the pills around a choice, outermost first, then its own. */
    const openChoice = async (
      user: ReturnType<typeof userEvent.setup>,
      foldable: Foldable,
    ) => {
      for (const id of [...foldable.around, foldable.id]) {
        const pill = await screen.findByRole('button', { name: `Pill ${id}` });
        await user.click(pill);
        await waitFor(() => expect(pill).not.toBeVisible());
      }
    };

    /** Opens again any of the pills that fold when the caret leaves them. */
    const reopen = async (
      user: ReturnType<typeof userEvent.setup>,
      foldable: Foldable,
    ) => {
      for (const id of [...foldable.around, foldable.id]) {
        const pill = screen.queryByRole('button', { name: `Pill ${id}` });
        if (pill === null) continue;
        await user.click(pill);
        await waitFor(() => expect(pill).not.toBeVisible());
      }
    };

    /**
     * The one contract: the list of rows says a row has a neighbour if and
     * only if the key at that row's edge moves focus to another row. Held
     * for every editor on show, including those that are not rows to stop at.
     * Leaving a pill's rows folds it, so it is opened again for each of them.
     */
    const expectKeysToAgreeWithTheList = async (
      user: ReturnType<typeof userEvent.setup>,
      expected: Expected,
      foldable: Foldable,
    ) => {
      for (const name of [...expected.rows, ...expected.frames]) {
        for (const key of ['ArrowDown', 'ArrowUp'] as const) {
          await reopen(user, foldable);
          const row = screen.getByRole('textbox', { name });
          const delta = key === 'ArrowDown' ? 1 : -1;
          placeCaret(row, key === 'ArrowDown' ? 'end' : 'start');
          await framesPass();
          if (!isOnShow(row)) {
            // The row went out of sight with the caret in it: no neighbours.
            expect(hasVersionRowBeside(row, delta)).toBe(false);
            continue;
          }
          const listed = hasVersionRowBeside(row, delta);
          const onShow = expected.rows
            .map((each) => screen.queryByRole('textbox', { name: each }))
            .filter((each) => each !== null);

          await user.keyboard(`{${key}}`);
          await framesPass();

          const now = document.activeElement;
          const moved =
            now instanceof HTMLElement &&
            now !== row &&
            now.hasAttribute('data-version');
          expect(moved, `${key} at the edge of ${name}`).toBe(listed);
          // And it goes to the next row in reading order.
          const at = onShow.indexOf(row);
          if (moved && at !== -1) expect(now).toBe(onShow[at + delta]);
        }
      }
    };

    // One case for each choice among words of each shape, so that a case
    // stays short.
    const openings = all.flatMap((shape, index) =>
      build(shape).expected.foldable.map(
        (foldable) => [index, foldable.id, shape, foldable] as const,
      ),
    );

    it.each(openings)(
      'list a neighbour exactly when the key moves to one, with a choice opened (shape %i, choice %s)',
      async (_index, _id, shape, foldable) => {
        const user = withSafeTypingIntoRichText(userEvent.setup());
        render(fieldFor(build(shape).json));
        await screen.findByRole('group', { name: 'Choice C' });

        await openChoice(user, foldable);
        const { expected } = build(
          shape,
          new Set([...foldable.around, foldable.id]),
        );
        // The rows on show are those of the message, opened rows too.
        await waitFor(() =>
          expect(visibleTextboxNames().toSorted()).toEqual(
            [...expected.rows, ...expected.frames].toSorted(),
          ),
        );
        rowsAreListedInOrder(expected);
        await expectKeysToAgreeWithTheList(user, expected, foldable);
      },
    );

    const foldings = all.flatMap((shape, index) =>
      (['leaving', 'Escape'] as const).map(
        (fold) => [index, fold, shape] as const,
      ),
    );

    it.each(foldings)(
      'leave the list when a pill folds again (shape %i, by %s)',
      async (_index, fold, shape) => {
        const base = build(shape).expected;
        const [foldable] = base.foldable.filter(
          (each) => each.around.length === 0,
        );
        if (!foldable) return;
        const opened = build(shape, new Set([foldable.id])).expected;
        const inside = opened.rows.find((name) => !base.rows.includes(name));
        if (!inside) return;

        const user = withSafeTypingIntoRichText(userEvent.setup());
        render(fieldFor(build(shape).json));
        await screen.findByRole('group', { name: 'Choice C' });
        await openChoice(user, foldable);
        const row = await screen.findByRole('textbox', { name: inside });

        if (fold === 'leaving')
          await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
        else {
          // Escape goes out one level at a time: out of a choice that is the
          // whole of a version first, then folds the pill.
          for (let level = 0; level < MAX_DEPTH && isOnShow(row); level += 1) {
            placeCaret(level === 0 ? row : activeEditor(), 'start');
            await user.keyboard('{Escape}');
            // The caret goes back to the line a frame later.
            await framesPass();
          }
        }

        // Back to the rows of the message; the rows that went out of sight
        // are not neighbours of anything, and nothing neighbours them.
        await expectRowsToBeWalked(user, base);
        expect(hasVersionRowBeside(row, 1)).toBe(false);
        expect(hasVersionRowBeside(row, -1)).toBe(false);
      },
    );
  });
});
