import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  type ProtocolBuilderSession,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
} from '../../../session.ts';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import ProtocolField from '../../ProtocolField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import Options from '../Options.tsx';

/**
 * The INLINE list's whole lifecycle, the way `rowEditorLifecycle` covers the
 * dialog row editor's.
 *
 * One options list bound to a stage document key and an unrelated text field,
 * inside the real `StageEditorShell`. The researcher's own writes (add, expand
 * a row and type in it, remove, keyboard reorder) are interleaved at random
 * with arrivals from elsewhere (insert, remove, move, rewrite — sometimes two
 * edits in one arrival), undo, redo and the lease going and coming back.
 *
 * Each of those has been fixed on its own, and the fixes interact: an option
 * has no id of its own, so which arriving row is which is inferred, and every
 * control the researcher is holding — an open editor, a pending remove, a
 * reorder — is held by that inferred id. What is asserted after every action is
 * therefore stated as rules rather than as one expected screen:
 *
 *   L1  nothing threw;
 *   L2  the rows on screen are the rows the document holds, in that order;
 *   L3  text typed into an unrelated key is still there while no arrival
 *       touched that key;
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

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Inline list lifecycle',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function renderList(session: ProtocolBuilderSession) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Page content">
          <ProtocolField
            name="title"
            label="Page heading"
            component={InputField}
          />
        </BuilderSection>
        <BuilderSection title="Answer options">
          <ProtocolArrayField
            name="options"
            label="Answer options"
            component={Options}
            addButtonLabel="Create new option"
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
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

const documentOptions = (session: ProtocolBuilderSessionStore): Option[] => {
  const value = session.getSnapshot().editedSection.fields.options;
  return Array.isArray(value)
    ? (value.filter(
        (row) => typeof row === 'object' && row !== null,
      ) as Option[])
    : [];
};

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

async function runLifecycleSequence(seed: number): Promise<string[]> {
  const failures: string[] = [];
  const random = mulberry32(seed);
  let revision = 1;
  const nextRevision = () => {
    revision += 1;
    return { sequence: BigInt(revision), hash: `revision-${revision}` };
  };

  const session = createSession({
    title: 'Welcome',
    options: [
      { label: 'Alpha', value: 'alpha' },
      { label: 'Bravo', value: 'bravo' },
      { label: 'Charlie', value: 'charlie' },
    ],
  });
  renderList(session);

  let typedTitle: string | null = null;
  let readOnly = false;
  const note = (message: string) => failures.push(`seed ${seed}: ${message}`);

  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const arrive = (fields: SectionDoc) => {
    const pending = session.getSnapshot().pendingCommands;
    const through = pending.at(-1)?.id ?? 0;
    act(() => {
      session.acknowledge({
        fields,
        throughBatchId: through,
        manifestRevision: nextRevision(),
      });
    });
  };

  try {
    for (let step = 0; step < STEPS_PER_SEQUENCE; step += 1) {
      const rows = documentOptions(session);
      const pick = random();
      let expectedAfterMove: string[] | null = null;
      let moveDescription = '';

      if (pick < 0.13) {
        const add = addButton();
        if (add) {
          act(() => {
            fireEvent.click(add);
          });
        }
      } else if (pick < 0.24) {
        // Expand a row so its value field is on screen.
        const edits = buttonsMatching('Edit option ');
        if (edits.length > 0) {
          const index = Math.floor(random() * edits.length);
          act(() => {
            fireEvent.click(edits[index]!);
          });
        }
      } else if (pick < 0.36) {
        const inputs = valueInputs();
        if (inputs.length > 0) {
          const index = Math.floor(random() * inputs.length);
          act(() => {
            fireEvent.change(inputs[index]!, {
              target: { value: `typed${seed}x${step}` },
            });
          });
        }
      } else if (pick < 0.46) {
        const buttons = buttonsMatching('Remove option ');
        if (buttons.length > 0) {
          const index = Math.floor(random() * buttons.length);
          act(() => {
            fireEvent.click(buttons[index]!);
          });
        }
      } else if (pick < 0.6) {
        const grips = buttonsMatching('Reorder option ');
        const before = rows.map(labelOf);
        if (grips.length > 1 && !readOnly && before.length === grips.length) {
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
      } else if (pick < 0.66) {
        if (!readOnly) {
          act(() => {
            session.undo();
          });
        }
      } else if (pick < 0.71) {
        if (!readOnly) {
          act(() => {
            session.redo();
          });
        }
      } else if (pick < 0.77) {
        const input = titleInput();
        if (input) {
          typedTitle = `heading-${seed}-${step}`;
          act(() => {
            fireEvent.change(input, { target: { value: typedTitle } });
          });
        }
      } else if (pick < 0.82) {
        readOnly = !readOnly;
        act(() => {
          session.setAccess(
            readOnly
              ? { mode: 'readOnly' as const, reason: 'lease-lost' as const }
              : { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 2n },
          );
        });
      } else {
        const next = [...rows];
        const shape = random();
        const at = next.length === 0 ? 0 : Math.floor(random() * next.length);
        if (shape < 0.3) {
          next.splice(at, 0, {
            label: `Remote${seed}x${step}`,
            value: `remote${seed}x${step}`,
          });
        } else if (shape < 0.5 && next.length > 0) {
          next.splice(at, 1);
        } else if (shape < 0.7 && next.length > 1) {
          const [moved] = next.splice(at, 1);
          next.splice(Math.floor(random() * next.length), 0, moved!);
        } else if (next.length > 0) {
          next[at] = {
            label: `${labelOf(next[at]!)} revised`,
            value: next[at]!.value,
          };
        }
        // One arrival carrying two edits — a collaborator who rewrote a row and
        // added another, an undo of two commands, a save.
        if (random() < 0.4 && next.length > 0) {
          next.splice(at, 0, {
            label: `Extra${seed}x${step}`,
            value: `extra${seed}x${step}`,
          });
        }
        arrive({ title: 'Welcome', options: next });
      }

      await settle();

      if (expectedAfterMove !== null) {
        const now = documentOptions(session).map(labelOf);
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
      const held = documentOptions(session);
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

/**
 * The same list, over a session that refuses some writes — the lease taken back
 * between the render a handler was built in and the click that dispatches — and,
 * for half the seeds, over a document key holding something that is not a list
 * at all.
 *
 *   R1  a refused write leaves the document exactly as it was;
 *   R2  the rows on screen are still the rows the document holds.
 */
function withRefusableDispatch(
  store: ProtocolBuilderSessionStore,
  shouldRefuse: () => boolean,
): ProtocolBuilderSession {
  return {
    subscribe: (listener: () => void) => store.subscribe(listener),
    getSnapshot: () => store.getSnapshot(),
    getServerSnapshot: () => store.getServerSnapshot(),
    dispatch: (commands) => {
      if (shouldRefuse()) throw new SessionReadOnlyError();
      store.dispatch(commands);
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    validate: () => store.validate(),
    requestCompoundEdit: (request) => store.requestCompoundEdit(request),
    finish: () => store.finish(),
    cancel: () => store.cancel(),
    getResourceGateway: () => store.getResourceGateway(),
  };
}

async function runRefusalSequence(seed: number): Promise<string[]> {
  const failures: string[] = [];
  const random = mulberry32(seed);
  const foreignStart = seed % 2 === 0;
  const store = createSession({
    title: 'Welcome',
    options: foreignStart
      ? ('a legacy string' as unknown as SectionDoc['options'])
      : [
          { label: 'Alpha', value: 'alpha' },
          { label: 'Bravo', value: 'bravo' },
        ],
  });
  let refuse = false;
  renderList(withRefusableDispatch(store, () => refuse));

  const log: string[] = [];
  const note = (message: string) =>
    failures.push(`seed ${seed}: ${message}\n    log: ${log.join(' ; ')}`);
  const settle = async () => {
    for (let flush = 0; flush < 4; flush += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  };

  try {
    for (let step = 0; step < STEPS_PER_SEQUENCE; step += 1) {
      const before = JSON.stringify(
        store.getSnapshot().editedSection.fields.options ?? null,
      );
      refuse = random() < 0.45;

      const pick = random();
      if (pick < 0.35) {
        const add = addButton();
        log.push(`${step}:add(refuse=${refuse},found=${Boolean(add)})`);
        if (add) {
          act(() => {
            fireEvent.click(add);
          });
        }
      } else if (pick < 0.55) {
        const edits = buttonsMatching('Edit option ');
        const index = Math.floor(random() * Math.max(edits.length, 1));
        log.push(`${step}:expand${index}(refuse=${refuse},n=${edits.length})`);
        if (edits.length > 0) {
          act(() => {
            fireEvent.click(edits[index]!);
          });
        }
      } else if (pick < 0.75) {
        const inputs = valueInputs();
        const index = Math.floor(random() * Math.max(inputs.length, 1));
        log.push(`${step}:type${index}(refuse=${refuse},n=${inputs.length})`);
        if (inputs.length > 0) {
          act(() => {
            fireEvent.change(inputs[index]!, {
              target: { value: `v${seed}x${step}` },
            });
          });
        }
      } else {
        const buttons = buttonsMatching('Remove option ');
        const index = Math.floor(random() * Math.max(buttons.length, 1));
        log.push(
          `${step}:remove${index}(refuse=${refuse},n=${buttons.length})`,
        );
        if (buttons.length > 0) {
          act(() => {
            fireEvent.click(buttons[index]!);
          });
        }
      }

      await settle();

      const after = JSON.stringify(
        store.getSnapshot().editedSection.fields.options ?? null,
      );
      if (refuse && before !== after) {
        note(
          `R1 step ${step}: refused, but the document moved ${before} -> ${after}`,
        );
      }

      refuse = false;
      const drawn = rowText().length;
      const held = documentOptions(store).length;
      if (drawn !== held) {
        note(
          `R2 step ${step}: ${drawn} rows drawn, ${held} in the document (foreign start: ${foreignStart})`,
        );
      }
    }
  } catch (error) {
    note(`R1 threw: ${String(error)}`);
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
    renderList(createSession({ title: 'Welcome', options: [] }));
    cleanup();
  });

  it.each(seedsUnderTest())(
    'keeps the screen, the document and the researcher’s typing in step, from seed %i',
    async (seed) => {
      expect(await runLifecycleSequence(seed)).toEqual([]);
    },
  );
});

describe('the inline list, over sequences whose writes are refused', () => {
  it.each(seedsUnderTest())(
    'never leaves a row on screen the document has not got, from seed %i',
    async (seed) => {
      expect(await runRefusalSequence(seed)).toEqual([]);
    },
  );
});
