import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  Codebook,
  CurrentProtocol,
  Stage,
  Variable,
} from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import {
  createVariableAsync,
  updateVariableByUUID,
} from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import {
  commitStageEditorDraftThunk,
  openStageEditorDraft,
  resetDraft,
} from '~/ducks/modules/stageEditorDraft';
import { getCanonicalProtocol, getProtocol } from '~/selectors/protocol';

/**
 * Regression coverage for #1382: nested field/variable editors used to write
 * the shared codebook the instant they were saved, so cancelling a field or
 * discarding a stage left the mutation behind and silently changed every other
 * consumer.
 *
 * Every case here drives the REAL store — routing, reducers and selectors
 * together — and asserts the canonical codebook is byte-identical after a
 * discard. One case per variant listed on the issue.
 */

// Variables the development protocol already shares between stages.
const COMPACT_DATE = '9b56bc6d-6b20-4e38-9aab-4057e78e1130'; // datetime/DatePicker
const DISCUSS_FREQ = '23c5a7b9-b553-4ff1-b515-6a81999773d2'; // ordinal, options
const VISUAL_ANALOG = '720224a3-e2d3-4729-968a-29d3f3e4fca6'; // scalar, parameters
const CONTACT_TYPE = 'e343a91f-628d-4175-870c-957beffa0151'; // categorical, options
const PERSON = 'person_node_type';
const DUMMY = 'dummy_node_type';

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  store.dispatch(
    protocolActions.setActiveProtocol(
      structuredClone(developmentProtocol) as unknown as CurrentProtocol,
    ),
  );

  return store;
};

type Store = ReturnType<typeof makeStore>;

const canonicalCodebook = (store: Store): Codebook =>
  getCanonicalProtocol(store.getState())!.codebook;

const draftCodebook = (store: Store): Codebook =>
  getProtocol(store.getState())!.codebook;

const variableIn = (codebook: Codebook, id: string): Variable | undefined => {
  for (const entity of ['node', 'edge'] as const) {
    for (const type of Object.values(codebook[entity] ?? {})) {
      const variable = type.variables?.[id];
      if (variable) return variable;
    }
  }
  return undefined;
};

const openEditor = (store: Store) => {
  store.dispatch(openStageEditorDraft({ id: 'alter-form-1' } as Stage));
};

describe('stage editor codebook transactions', () => {
  let store: Store;
  let before: Codebook;

  beforeEach(() => {
    store = makeStore();
    before = structuredClone(canonicalCodebook(store));
    openEditor(store);
  });

  // Each entry writes one codebook property the issue lists as leaking.
  const variants: {
    name: string;
    write: (target: Store) => Promise<unknown>;
    assertDraftChanged: (codebook: Codebook) => void;
  }[] = [
    {
      name: 'an input control swapped to RelativeDatePicker',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(
            COMPACT_DATE,
            { component: 'RelativeDatePicker' },
            ['component'],
          ),
        ),
      assertDraftChanged: (codebook) => {
        const variable = variableIn(codebook, COMPACT_DATE);
        expect(variable && 'component' in variable && variable.component).toBe(
          'RelativeDatePicker',
        );
      },
    },
    {
      name: 'an existing variable renamed',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(COMPACT_DATE, { name: 'compactdateQA' }),
        ),
      assertDraftChanged: (codebook) => {
        expect(variableIn(codebook, COMPACT_DATE)?.name).toBe('compactdateQA');
      },
    },
    {
      name: 'an ordinal option relabelled',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(
            DISCUSS_FREQ,
            { options: [{ label: 'Rarely QA', value: 1 }] },
            ['options'],
          ),
        ),
      assertDraftChanged: (codebook) => {
        const variable = variableIn(codebook, DISCUSS_FREQ);
        expect(
          variable && 'options' in variable ? variable.options : undefined,
        ).toEqual([{ label: 'Rarely QA', value: 1 }]);
      },
    },
    {
      name: 'a shared categorical option relabelled',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(
            CONTACT_TYPE,
            { options: [{ label: 'Friend QA', value: 1 }] },
            ['options'],
          ),
        ),
      assertDraftChanged: (codebook) => {
        const variable = variableIn(codebook, CONTACT_TYPE);
        expect(
          variable && 'options' in variable ? variable.options : undefined,
        ).toEqual([{ label: 'Friend QA', value: 1 }]);
      },
    },
    {
      name: 'a VAS label changed',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(
            VISUAL_ANALOG,
            { parameters: { minLabel: 'Weak', maxLabel: 'MAX CUSTOM' } },
            ['parameters'],
          ),
        ),
      assertDraftChanged: (codebook) => {
        const variable = variableIn(codebook, VISUAL_ANALOG);
        expect(
          variable && 'parameters' in variable
            ? variable.parameters
            : undefined,
        ).toEqual({ minLabel: 'Weak', maxLabel: 'MAX CUSTOM' });
      },
    },
    {
      name: 'a validation maximum lowered',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(DISCUSS_FREQ, { validation: { maxValue: 7 } }, [
            'validation',
          ]),
        ),
      assertDraftChanged: (codebook) => {
        const variable = variableIn(codebook, DISCUSS_FREQ);
        expect(
          variable && 'validation' in variable
            ? variable.validation
            : undefined,
        ).toEqual({ maxValue: 7 });
      },
    },
    {
      name: 'Required enabled on a variable another stage already uses',
      write: (target) =>
        target.dispatch(
          updateVariableByUUID(
            COMPACT_DATE,
            { validation: { required: true } },
            ['validation'],
          ),
        ),
      assertDraftChanged: (codebook) => {
        const variable = variableIn(codebook, COMPACT_DATE);
        expect(
          variable && 'validation' in variable
            ? variable.validation
            : undefined,
        ).toEqual({ required: true });
      },
    },
  ];

  describe.each(variants)('$name', ({ write, assertDraftChanged }) => {
    it('is visible to the editor but not to the canonical protocol', async () => {
      await write(store);

      assertDraftChanged(draftCodebook(store));
      expect(canonicalCodebook(store)).toEqual(before);
    });

    it('leaves the canonical codebook byte-identical after a discard', async () => {
      await write(store);
      store.dispatch(resetDraft(null));

      expect(canonicalCodebook(store)).toEqual(before);
      // And the editor's view falls back to canonical, so nothing lingers.
      expect(draftCodebook(store)).toEqual(before);
    });

    it('reaches the canonical codebook when the stage is committed', async () => {
      await write(store);
      store.dispatch(
        commitStageEditorDraftThunk('alter-form-1', {
          id: 'alter-form-1',
          type: 'AlterForm',
          label: 'Alter Form',
        } as Stage),
      );

      assertDraftChanged(canonicalCodebook(store));
    });
  });

  it('drops a variable created for a field that was then discarded', async () => {
    await store.dispatch(
      createVariableAsync({
        entity: 'node',
        type: PERSON,
        configuration: {
          name: 'qaOrphanVar',
          type: 'text',
          component: 'Text',
        } as Partial<Variable>,
      }),
    );

    const created = Object.entries(
      draftCodebook(store).node?.[PERSON]?.variables ?? {},
    ).find(([, variable]) => variable.name === 'qaOrphanVar');
    expect(created).toBeDefined();
    // Never written to the canonical codebook in the first place.
    expect(canonicalCodebook(store)).toEqual(before);

    store.dispatch(resetDraft(null));

    expect(canonicalCodebook(store)).toEqual(before);
    expect(
      Object.values(canonicalCodebook(store).node?.[PERSON]?.variables ?? {}),
    ).not.toContainEqual(expect.objectContaining({ name: 'qaOrphanVar' }));
  });

  it('drops a created variable that an in-editor undo has already stepped past', async () => {
    await store.dispatch(
      createVariableAsync({
        entity: 'node',
        type: DUMMY,
        configuration: {
          name: 'undoneVar',
          type: 'text',
          component: 'Text',
        } as Partial<Variable>,
      }),
    );

    // Undo rewinds the draft codebook with the rest of the timeline entry, so
    // the variable cannot survive to be committed as an orphan.
    store.dispatch({ type: 'stageEditorDraft/undo' });

    expect(
      Object.values(draftCodebook(store).node?.[DUMMY]?.variables ?? {}),
    ).not.toContainEqual(expect.objectContaining({ name: 'undoneVar' }));

    store.dispatch(
      commitStageEditorDraftThunk('alter-form-1', {
        id: 'alter-form-1',
        type: 'AlterForm',
        label: 'Alter Form',
      } as Stage),
    );

    expect(
      Object.values(canonicalCodebook(store).node?.[DUMMY]?.variables ?? {}),
    ).not.toContainEqual(expect.objectContaining({ name: 'undoneVar' }));
  });

  // A draft must never outlive the protocol it was taken from: its codebook
  // would be overlaid onto the NEXT protocol opened, and its open transaction
  // would swallow codebook writes made anywhere else.
  it('ends the transaction when the protocol is closed', async () => {
    await store.dispatch(
      updateVariableByUUID(COMPACT_DATE, { component: 'RelativeDatePicker' }, [
        'component',
      ]),
    );
    expect(store.getState().stageEditorDraft.ui.initialCodebook).not.toBeNull();

    store.dispatch(protocolActions.clearActiveProtocol());

    expect(store.getState().stageEditorDraft.ui.initialCodebook).toBeNull();
    expect(store.getState().stageEditorDraft.history.present).toBeNull();
  });

  it('does not overlay a stale draft codebook onto the next protocol opened', async () => {
    await store.dispatch(
      createVariableAsync({
        entity: 'node',
        type: PERSON,
        configuration: {
          name: 'fromProtocolA',
          type: 'text',
          component: 'Text',
        } as Partial<Variable>,
      }),
    );

    store.dispatch(
      protocolActions.setActiveProtocol({
        name: 'Protocol B',
        stages: [],
        codebook: { node: {}, edge: {} },
      } as unknown as CurrentProtocol),
    );

    expect(getProtocol(store.getState())?.name).toBe('Protocol B');
    expect(draftCodebook(store).node).toEqual({});
    expect(store.getState().stageEditorDraft.ui.initialCodebook).toBeNull();
  });

  it('writes straight to the canonical codebook when no editor is open', async () => {
    store.dispatch(resetDraft(null));

    await store.dispatch(
      updateVariableByUUID(COMPACT_DATE, { component: 'RelativeDatePicker' }, [
        'component',
      ]),
    );

    const variable = variableIn(canonicalCodebook(store), COMPACT_DATE);
    expect(variable && 'component' in variable && variable.component).toBe(
      'RelativeDatePicker',
    );
  });

  it('commits the stage and its codebook as one timeline entry', async () => {
    const timelineBefore = store.getState().activeProtocol.timeline.length;

    await store.dispatch(
      updateVariableByUUID(COMPACT_DATE, { component: 'RelativeDatePicker' }, [
        'component',
      ]),
    );

    // The codebook write itself must not move the protocol timeline at all.
    expect(store.getState().activeProtocol.timeline.length).toBe(
      timelineBefore,
    );

    store.dispatch(
      commitStageEditorDraftThunk('alter-form-1', {
        id: 'alter-form-1',
        type: 'AlterForm',
        label: 'Alter Form Renamed',
      } as Stage),
    );

    expect(store.getState().activeProtocol.timeline.length).toBe(
      timelineBefore + 1,
    );

    const protocol = getCanonicalProtocol(store.getState())!;
    const stage = protocol.stages.find(({ id }) => id === 'alter-form-1');
    expect(stage?.label).toBe('Alter Form Renamed');
    const variable = variableIn(protocol.codebook, COMPACT_DATE);
    expect(variable && 'component' in variable && variable.component).toBe(
      'RelativeDatePicker',
    );
  });

  // A half-commit (codebook applied, stage dropped) would leave behind the
  // codebook edits of a stage that no longer exists.
  it('commits nothing when the stage was deleted from under the editor', async () => {
    await store.dispatch(
      updateVariableByUUID(COMPACT_DATE, { component: 'RelativeDatePicker' }, [
        'component',
      ]),
    );

    store.dispatch(
      commitStageEditorDraftThunk('a-stage-that-never-existed', {
        id: 'a-stage-that-never-existed',
        type: 'AlterForm',
        label: 'Gone',
      } as Stage),
    );

    expect(canonicalCodebook(store)).toEqual(before);
    expect(
      getCanonicalProtocol(store.getState())!.stages.some(
        ({ id }) => id === 'a-stage-that-never-existed',
      ),
    ).toBe(false);
  });

  it('inserts a brand-new stage and its codebook in the same commit', async () => {
    const stagesBefore = getCanonicalProtocol(store.getState())!.stages.length;

    await store.dispatch(
      updateVariableByUUID(COMPACT_DATE, { component: 'RelativeDatePicker' }, [
        'component',
      ]),
    );

    store.dispatch(
      commitStageEditorDraftThunk(
        null,
        { type: 'Information', label: 'Brand New' } as Stage,
        1,
      ),
    );

    const protocol = getCanonicalProtocol(store.getState())!;
    expect(protocol.stages).toHaveLength(stagesBefore + 1);
    expect(protocol.stages[1]?.label).toBe('Brand New');
    expect(protocol.stages[1]?.id).toEqual(expect.any(String));
    const variable = variableIn(protocol.codebook, COMPACT_DATE);
    expect(variable && 'component' in variable && variable.component).toBe(
      'RelativeDatePicker',
    );
  });
});
