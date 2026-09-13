import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { createStageDraftProbe } from '../../__tests__/stageDraftProbe.tsx';
import Options from '../Options.tsx';

/**
 * The INLINE list's whole lifecycle.
 *
 * One options list bound to a stage document key and an unrelated text field,
 * inside the real stage editor. The researcher's own writes — add, expand a
 * row and type in it, remove, keyboard reorder, and typing into a key the list
 * has nothing to do with — are interleaved at random.
 *
 * Each of those has been fixed on its own, and the fixes interact: an option
 * has no id of its own, so which row an edit addresses is inferred from
 * content, and the list on screen and the document behind it are numbered
 * separately. What is asserted after every action is therefore stated as rules
 * rather than as one expected screen:
 *
 *   L1  nothing threw;
 *   L2  the rows on screen are the rows the document holds, in that order;
 *   L3  text typed into an unrelated key is still there;
 *   L4  a reorder moves the row it was asked to move, and nothing else.
 */

type Option = { label?: unknown; value?: unknown };

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function renderList(fields: SectionDoc) {
  const { probe, draft } = createStageDraftProbe();
  renderStageEditor({
    stage: { type: 'Information', fields },
    sections: (
      <>
        <BuilderSection title="Page content">
          {probe}
          <Field name="title" label="Page heading" component={InputField} />
        </BuilderSection>
        <BuilderSection title="Answer options">
          <Field
            name="options"
            label="Answer options"
            component={Options}
            addButtonLabel="Create new option"
          />
        </BuilderSection>
      </>
    ),
  });
  return draft;
}

const titleInput = () =>
  document.querySelector<HTMLInputElement>('input[name="title"]');

const valueInputs = () => [
  ...document.querySelectorAll<HTMLInputElement>(
    'input[placeholder="Enter a value..."]',
  ),
];

const buttonsMatching = (prefix: string) => [
  ...document.querySelectorAll<HTMLElement>(`button[aria-label^="${prefix}"]`),
];

const addButton = () =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (node) => node.textContent === 'Create new option',
  );

/**
 * The rows themselves, told apart from the list's own empty-state item by the
 * Remove control every row carries and the empty state does not.
 */
const rowText = () =>
  [...(document.querySelector('[role="list"]')?.children ?? [])]
    .filter(
      (node) =>
        node.tagName === 'LI' &&
        node.querySelector('button[aria-label^="Remove option "]') !== null,
    )
    .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim());

const documentOptions = (options: unknown): Option[] =>
  Array.isArray(options)
    ? (options.filter(
        (row) => typeof row === 'object' && row !== null,
      ) as Option[])
    : [];

/**
 * A row field as text. Defensive only — these sequences write strings — but a
 * failure message built from a foreign value has to read as that value rather
 * than as `[object Object]`.
 */
const asText = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? '');

/** A collapsed row's own text, built from the document exactly as it draws. */
const asRowText = (row: Option) => {
  const label =
    typeof row.label === 'string' && row.label.trim() !== ''
      ? row.label
      : 'Untitled option';
  const value =
    row.value === undefined || row.value === null || row.value === ''
      ? 'No value'
      : asText(row.value);
  return `${label} — ${value}`.replace(/\s+/g, ' ').trim();
};

const labelOf = (row: Option) =>
  typeof row.label === 'string' ? row.label : asText(row.label);

const SEQUENCES = 200;
const STEPS_PER_SEQUENCE = 8;

const LIST_START: SectionDoc = {
  title: 'Welcome',
  options: [
    { label: 'Alpha', value: 'alpha' },
    { label: 'Bravo', value: 'bravo' },
    { label: 'Charlie', value: 'charlie' },
  ],
};

/**
 * What an import, a migration or a hand-edited protocol can leave at a list
 * key. The editor draws an empty list with a working Add over it, so every
 * rule below has to hold from there too.
 */
const FOREIGN_START: SectionDoc = {
  title: 'Welcome',
  options: 'a legacy string',
};

/**
 * The seeds to run: all of them, or exactly the ones named in
 * `INLINE_LIST_SEEDS` (`INLINE_LIST_SEEDS=137`, `INLINE_LIST_SEEDS=137,204`).
 *
 * A reported failure names one seed, and replaying just that seed is how it is
 * worked on — `-t 'seed 137'` would still mount the other 199.
 */
const seedsUnderTest = (): number[] => {
  const requested = process.env.INLINE_LIST_SEEDS;
  if (requested === undefined || requested.trim() === '') {
    return Array.from({ length: SEQUENCES }, (_, index) => index + 1);
  }
  return requested.split(',').map((entry) => {
    const seed = Number(entry.trim());
    // A non-number seeds some other sequence quietly (`NaN >>> 0` is 0) and
    // reports it under the name that was asked for.
    if (!Number.isInteger(seed)) {
      throw new Error(`INLINE_LIST_SEEDS holds "${entry.trim()}", not a seed.`);
    }
    return seed;
  });
};

async function runLifecycleSequence(
  seed: number,
  start: SectionDoc,
): Promise<string[]> {
  const failures: string[] = [];
  const random = mulberry32(seed);

  const draft = renderList(start);
  const options = () => documentOptions(draft().options);

  let typedTitle: string | null = null;
  const note = (message: string) => failures.push(`seed ${seed}: ${message}`);

  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  try {
    for (let step = 0; step < STEPS_PER_SEQUENCE; step += 1) {
      const rows = options();
      const pick = random();
      let expectedAfterMove: string[] | null = null;
      let moveDescription = '';

      if (pick < 0.22) {
        const add = addButton();
        if (add) {
          act(() => {
            fireEvent.click(add);
          });
        }
      } else if (pick < 0.4) {
        // Expand a row so its value field is on screen.
        const edits = buttonsMatching('Edit option ');
        if (edits.length > 0) {
          const index = Math.floor(random() * edits.length);
          act(() => {
            fireEvent.click(edits[index]!);
          });
        }
      } else if (pick < 0.58) {
        const inputs = valueInputs();
        if (inputs.length > 0) {
          const index = Math.floor(random() * inputs.length);
          act(() => {
            fireEvent.change(inputs[index]!, {
              target: { value: `typed${seed}x${step}` },
            });
          });
        }
      } else if (pick < 0.72) {
        const buttons = buttonsMatching('Remove option ');
        if (buttons.length > 0) {
          const index = Math.floor(random() * buttons.length);
          act(() => {
            fireEvent.click(buttons[index]!);
          });
        }
      } else if (pick < 0.9) {
        const grips = buttonsMatching('Reorder option ');
        const before = rows.map(labelOf);
        if (grips.length > 1 && before.length === grips.length) {
          const index = Math.floor(random() * grips.length);
          const down = random() < 0.5;
          const target = index + (down ? 1 : -1);
          if (target >= 0 && target < grips.length) {
            act(() => {
              grips[index]!.focus();
              fireEvent.keyDown(grips[index]!, {
                key: down ? 'ArrowDown' : 'ArrowUp',
              });
            });
            const expected = [...before];
            const [moved] = expected.splice(index, 1);
            expected.splice(target, 0, moved!);
            expectedAfterMove = expected;
            moveDescription = `reorder ${index}->${target} of [${before.join(', ')}]`;
          }
        }
      } else {
        const input = titleInput();
        if (input) {
          typedTitle = `heading-${seed}-${step}`;
          act(() => {
            fireEvent.change(input, { target: { value: typedTitle } });
          });
        }
      }

      await settle();

      if (expectedAfterMove !== null) {
        const now = options().map(labelOf);
        if (
          now.length === expectedAfterMove.length &&
          now.join(' | ') !== expectedAfterMove.join(' | ')
        ) {
          note(
            `L4 step ${step}: ${moveDescription} left [${now.join(', ')}], expected [${expectedAfterMove.join(', ')}]`,
          );
        }
      }

      // L2: what is drawn is what the document holds. A row the researcher has
      // expanded shows its editor rather than its summary, so those rows are
      // compared by count alone.
      const drawn = rowText();
      const held = options();
      if (drawn.length !== held.length) {
        note(
          `L2 step ${step}: ${drawn.length} rows drawn, ${held.length} in the document ([${drawn.join(' / ')}] vs [${held.map(asRowText).join(' / ')}])`,
        );
      } else {
        for (const [index, row] of held.entries()) {
          const expected = asRowText(row);
          const actual = drawn[index]!;
          if (actual.includes('—') && actual !== expected) {
            note(
              `L2 step ${step}: row ${index} draws "${actual}", document holds "${expected}"`,
            );
            break;
          }
        }
      }

      if (typedTitle !== null) {
        const value = titleInput()?.value;
        if (value !== typedTitle) {
          note(
            `L3 step ${step}: typed "${typedTitle}" but the field holds "${String(value)}"`,
          );
          typedTitle = null;
        }
      }
    }
  } catch (error) {
    note(
      `L1 threw: ${String(error)}\n${error instanceof Error ? (error.stack ?? '') : ''}`,
    );
  }

  return failures;
}

afterEach(cleanup);

/**
 * One test per seed, rather than one test that sweeps every seed: a sequence
 * costs a mount plus eight steps read back out of the DOM, and CI's shared
 * runners are much slower on this package's DOM tests than a laptop is. Swept
 * into one `it`, all 200 share a single per-test budget; per seed, each carries
 * only its own sequence and a failure names the seed that produced it.
 */
describe('the inline list, over random authoring sequences', () => {
  // The first mount in a file pays for what every later one reuses — React's
  // first render of this tree, the accessible-name machinery, the dialog layer.
  // Left inside a test it lands on whichever seed runs first and roughly
  // doubles that seed's measured cost, which is the number a per-test timeout
  // is judged against.
  beforeAll(() => {
    renderList({ title: 'Welcome', options: [] });
    cleanup();
  });

  it.each(seedsUnderTest())(
    'keeps the screen, the document and the researcher’s typing in step, from seed %i',
    async (seed) => {
      expect(await runLifecycleSequence(seed, LIST_START)).toEqual([]);
    },
  );
});

describe('the inline list, over a key an import left holding something else', () => {
  it.each(seedsUnderTest())(
    'never leaves a row on screen the document has not got, from seed %i',
    async (seed) => {
      expect(await runLifecycleSequence(seed, FOREIGN_START)).toEqual([]);
    },
  );
});
