import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  collectProtocolObjectIds,
  createProtocolObjectId,
  CurrentProtocolSchema,
  findDuplicateProtocolObjectIds,
  type CurrentProtocol,
  type Stage,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { commitStage } from '~/ducks/modules/protocol/commitStage';
import { actionCreators as stageActions } from '~/ducks/modules/protocol/stages';
import { rootReducer } from '~/ducks/modules/root';
import { createSection } from '~/protocolBuilder/sectionWrites';

/**
 * Undo and redo restore whole protocol snapshots, so every protocol object id
 * has to come back exactly as it was at that point in the history. These run
 * against Architect's own root reducer and the actions its editors dispatch.
 */
const makeStore = () => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setActiveProtocol(CurrentProtocolSchema.parse(allInterfaces)));
  return store;
};

type Store = ReturnType<typeof makeStore>;

type RosterStage = Extract<Stage, { type: 'NameGeneratorRoster' }>;

const isRoster = (stage: Stage): stage is RosterStage =>
  stage.type === 'NameGeneratorRoster';

const presentOf = (store: Store): CurrentProtocol => {
  const present = store.getState().activeProtocol.present;
  if (!present) throw new Error('No active protocol');
  return present;
};

const undo = (store: Store) => store.dispatch(timelineActions.undo());
const redo = (store: Store) => store.dispatch(timelineActions.redo());

const valueAt = (root: unknown, path: readonly (string | number)[]) =>
  path.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? Reflect.get(node, key)
        : undefined,
    root,
  );

const hasStringId = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'string';

/**
 * Every marked object's own content, keyed by its id. The id, the object's
 * position and the identity of the objects nested in it are left out, so a
 * reorder that keeps each id with its object leaves this unchanged, and an id
 * that moved to another object changes it.
 */
const objectsById = (protocol: CurrentProtocol) =>
  new Map(
    collectProtocolObjectIds(protocol).map(({ id, path }) => {
      const object = valueAt(protocol, path.slice(0, -1));
      const content =
        typeof object === 'object' && object !== null
          ? Object.entries(object).filter(([key]) => key !== 'id')
          : [];
      return [
        id,
        JSON.stringify(content, (key, value: unknown) =>
          key !== '' && hasStringId(value) ? 'nested object' : value,
        ),
      ];
    }),
  );

const idsInOrder = (protocol: CurrentProtocol) =>
  collectProtocolObjectIds(protocol).map(({ id }) => id);

const rosterOf = (protocol: CurrentProtocol, stageId?: string) => {
  const stage = protocol.stages.find(
    (candidate) =>
      isRoster(candidate) &&
      (stageId === undefined || candidate.id === stageId),
  );
  if (stage === undefined || !isRoster(stage)) {
    throw new Error('No roster stage');
  }
  return stage;
};

/** The ids of the roster stage and each nested row kind the tests touch. */
const rosterIds = (stage: RosterStage) => ({
  stage: stage.id,
  prompts: stage.prompts.map(({ id }) => id),
  sortRules: (stage.sortOptions?.sortOrder ?? []).map(({ id }) => id),
  sortableProperties: (stage.sortOptions?.sortableProperties ?? []).map(
    ({ id }) => id,
  ),
  additionalProperties: (stage.cardOptions?.additionalProperties ?? []).map(
    ({ id }) => id,
  ),
});

/** Commits an edit of a stage the way a stage editor's save does. */
const commitEdit = (store: Store, stage: Stage) =>
  store.dispatch(commitStage({ stageId: stage.id, stage }));

describe('protocol object ids through undo and redo', () => {
  let store: Store;

  beforeEach(() => {
    store = makeStore();
  });

  it('brings a created stage back on redo with the ids it was created with', async () => {
    const template = rosterOf(presentOf(store));
    const { id: _templateId, ...document } = template;
    const stagesBefore = presentOf(store).stages.map(({ id }) => id);

    const creation = await createSection(store, 'stage', {
      ...document,
      label: { 'en-US': 'Second roster' },
      prompts: template.prompts.map((prompt) => ({
        ...prompt,
        id: createProtocolObjectId(),
      })),
      cardOptions: {
        additionalProperties: (
          template.cardOptions?.additionalProperties ?? []
        ).map((row) => ({ ...row, id: createProtocolObjectId() })),
      },
      sortOptions: {
        sortOrder: (template.sortOptions?.sortOrder ?? []).map((rule) => ({
          ...rule,
          id: createProtocolObjectId(),
        })),
        sortableProperties: (
          template.sortOptions?.sortableProperties ?? []
        ).map((row) => ({ ...row, id: createProtocolObjectId() })),
      },
    });
    expect(creation.status).toBe('created');

    const createdStageId = presentOf(store)
      .stages.map(({ id }) => id)
      .find((id) => !stagesBefore.includes(id));
    if (createdStageId === undefined) throw new Error('No stage was created');
    const created = rosterIds(rosterOf(presentOf(store), createdStageId));
    const afterCreate = idsInOrder(presentOf(store));
    expect(created.sortRules).toHaveLength(1);
    expect(findDuplicateProtocolObjectIds(presentOf(store))).toEqual([]);

    undo(store);
    expect(presentOf(store).stages.map(({ id }) => id)).toEqual(stagesBefore);
    for (const id of Object.values(created).flat()) {
      expect(idsInOrder(presentOf(store))).not.toContain(id);
    }

    redo(store);
    expect(rosterIds(rosterOf(presentOf(store), createdStageId))).toEqual(
      created,
    );
    expect(idsInOrder(presentOf(store))).toEqual(afterCreate);
  });

  it('brings created prompt and sort rule rows back on redo with their ids', () => {
    const roster = rosterOf(presentOf(store));
    const before = rosterIds(roster);
    const newPromptId = createProtocolObjectId();
    const newSortRuleId = createProtocolObjectId();

    commitEdit(store, {
      ...roster,
      prompts: [
        ...roster.prompts,
        { id: newPromptId, text: { 'en-US': 'Select anyone else' } },
      ],
      sortOptions: {
        ...roster.sortOptions,
        sortOrder: [
          ...(roster.sortOptions?.sortOrder ?? []),
          { id: newSortRuleId, property: 'name', direction: 'asc' },
        ],
      },
    });
    const afterCreate = objectsById(presentOf(store));

    undo(store);
    expect(rosterIds(rosterOf(presentOf(store)))).toEqual(before);

    redo(store);
    const redone = rosterIds(rosterOf(presentOf(store)));
    expect(redone.prompts).toEqual([...before.prompts, newPromptId]);
    expect(redone.sortRules).toEqual([...before.sortRules, newSortRuleId]);
    expect(objectsById(presentOf(store))).toEqual(afterCreate);
  });

  it('keeps every id with its object through edits, reorders, undo and redo', () => {
    const roster = rosterOf(presentOf(store));
    commitEdit(store, {
      ...roster,
      prompts: [
        ...roster.prompts,
        { id: createProtocolObjectId(), text: { 'en-US': 'Second prompt' } },
      ],
      sortOptions: {
        ...roster.sortOptions,
        sortOrder: [
          ...(roster.sortOptions?.sortOrder ?? []),
          { id: createProtocolObjectId(), property: 'name', direction: 'asc' },
        ],
      },
    });

    const states: CurrentProtocol[] = [presentOf(store)];

    // An edit of the first prompt's text, in place.
    const edited = rosterOf(presentOf(store));
    commitEdit(store, {
      ...edited,
      prompts: edited.prompts.map((prompt, index) =>
        index === 0
          ? { ...prompt, text: { 'en-US': 'Edited prompt' } }
          : prompt,
      ),
    });
    states.push(presentOf(store));

    // The prompts and the sort rules each change places.
    const reordered = rosterOf(presentOf(store));
    commitEdit(store, {
      ...reordered,
      prompts: reordered.prompts.toReversed(),
      sortOptions: {
        ...reordered.sortOptions,
        sortOrder: (reordered.sortOptions?.sortOrder ?? []).toReversed(),
      },
    });
    states.push(presentOf(store));

    // The roster stage moves up the timeline.
    const rosterIndex = presentOf(store).stages.findIndex(isRoster);
    store.dispatch(stageActions.moveStage(rosterIndex, 0));
    states.push(presentOf(store));

    const [initial, afterEdit, afterReorder, afterMove] = states;
    if (!initial || !afterEdit || !afterReorder || !afterMove) {
      throw new Error('A step was not recorded');
    }

    // Each step changed what it set out to change.
    const editedPromptId = rosterIds(rosterOf(initial)).prompts[0];
    expect(rosterOf(afterEdit).prompts[0]?.text).toEqual({
      'en-US': 'Edited prompt',
    });
    expect(rosterIds(rosterOf(afterReorder)).prompts).toEqual(
      rosterIds(rosterOf(afterEdit)).prompts.toReversed(),
    );
    expect(rosterIds(rosterOf(afterReorder)).sortRules).toEqual(
      rosterIds(rosterOf(afterEdit)).sortRules.toReversed(),
    );
    expect(afterMove.stages[0]?.id).toBe(rosterOf(initial).id);
    expect(idsInOrder(afterMove)).not.toEqual(idsInOrder(afterReorder));

    // The ids follow the objects: only the edited prompt's content changed,
    // and neither reorder moved an id onto another object.
    const editedObjects = objectsById(afterEdit);
    const initialObjects = objectsById(initial);
    for (const [id, content] of initialObjects) {
      if (id === editedPromptId) {
        expect(editedObjects.get(id)).not.toBe(content);
      } else {
        expect(editedObjects.get(id)).toBe(content);
      }
    }
    expect(objectsById(afterReorder)).toEqual(editedObjects);
    expect(objectsById(afterMove)).toEqual(editedObjects);

    // Undo walks back through each state and redo forward again, ids and all.
    for (const expected of states.toReversed().slice(1)) {
      undo(store);
      expect(idsInOrder(presentOf(store))).toEqual(idsInOrder(expected));
      expect(objectsById(presentOf(store))).toEqual(objectsById(expected));
    }
    for (const expected of states.slice(1)) {
      redo(store);
      expect(idsInOrder(presentOf(store))).toEqual(idsInOrder(expected));
      expect(objectsById(presentOf(store))).toEqual(objectsById(expected));
    }
    expect(findDuplicateProtocolObjectIds(presentOf(store))).toEqual([]);
  });

  it('restores a deleted stage with its own id and the ids of its rows', async () => {
    const roster = rosterOf(presentOf(store));
    const original = rosterIds(roster);
    const before = objectsById(presentOf(store));

    await store.dispatch(stageActions.deleteStage(roster.id)).unwrap();
    expect(presentOf(store).stages.some(({ id }) => id === roster.id)).toBe(
      false,
    );

    undo(store);
    expect(rosterIds(rosterOf(presentOf(store)))).toEqual(original);
    expect(objectsById(presentOf(store))).toEqual(before);
  });

  it('restores a deleted sort rule and prompt with their ids', () => {
    const roster = rosterOf(presentOf(store));
    commitEdit(store, {
      ...roster,
      prompts: [
        ...roster.prompts,
        { id: createProtocolObjectId(), text: { 'en-US': 'Second prompt' } },
      ],
      sortOptions: {
        ...roster.sortOptions,
        sortOrder: [
          ...(roster.sortOptions?.sortOrder ?? []),
          { id: createProtocolObjectId(), property: 'name', direction: 'asc' },
        ],
      },
    });
    const withRows = rosterOf(presentOf(store));
    const original = rosterIds(withRows);
    const before = objectsById(presentOf(store));

    commitEdit(store, {
      ...withRows,
      prompts: withRows.prompts.slice(1),
      sortOptions: {
        ...withRows.sortOptions,
        sortOrder: (withRows.sortOptions?.sortOrder ?? []).slice(1),
      },
    });
    expect(rosterIds(rosterOf(presentOf(store))).prompts).toEqual(
      original.prompts.slice(1),
    );

    undo(store);
    expect(rosterIds(rosterOf(presentOf(store)))).toEqual(original);
    expect(objectsById(presentOf(store))).toEqual(before);
  });
});
