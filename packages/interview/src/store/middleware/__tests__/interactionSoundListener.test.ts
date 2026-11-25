import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../../__tests__/testIds';
import {
  FakeAudioContext,
  settle,
} from '../../../sounds/__tests__/fakeAudioContext';
import { INTERACTION_SOUND_SPRITE } from '../../../sounds/interactionSoundSprite';
import {
  createSoundEngine,
  type OneShotSoundName,
} from '../../../sounds/soundEngine';
import protocol from '../../modules/protocol';
import session, {
  addEdge,
  addNode,
  addNodesAndEdges,
  addNodeToPrompt,
  deleteEdge,
  deleteNode,
  removeNodeFromPrompt,
  restoreNetwork,
  restoreNode,
  toggleEdge,
  toggleNodeAttributes,
  updateNode,
} from '../../modules/session';
import ui from '../../modules/ui';
import { createInteractionSoundListenerMiddleware } from '../interactionSoundListener';

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const CLOSE = testVariableId('close');
const BIN = testVariableId('bin');

const person = (id: string, attributes: Record<string, unknown> = {}) =>
  ({
    [entityPrimaryKeyProperty]: id,
    type: PERSON,
    [entityAttributesProperty]: attributes,
    promptIDs: ['p1'],
    stageId: 's1',
  }) as NcNode;

const knows = (id: string, from: string, to: string) =>
  ({
    [entityPrimaryKeyProperty]: id,
    type: KNOWS,
    from,
    to,
    [entityAttributesProperty]: {},
  }) as NcEdge;

function buildStore(
  network: { nodes?: NcNode[]; edges?: NcEdge[] } = {},
  playSound?: (name: OneShotSoundName) => void,
) {
  const play = vi.fn<(name: OneShotSoundName) => void>(playSound);
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'i1',
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        network: {
          ego: { _uid: 'ego' },
          nodes: network.nodes ?? [],
          edges: network.edges ?? [],
        },
        promptIndex: 0,
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        codebook: {
          node: {
            [PERSON]: {
              name: 'Person',
              color: 'blue',
              variables: {
                [CLOSE]: { name: 'close', type: 'boolean' },
                [BIN]: { name: 'bin', type: 'categorical' },
              },
            },
          },
          edge: { [KNOWS]: { name: 'Knows', color: 'red', variables: {} } },
        },
        stages: [
          { id: 's0', type: 'Information' },
          { id: 's1', type: 'NameGenerator', prompts: [{ id: 'p1' }] },
        ],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(
        createInteractionSoundListenerMiddleware({ play }).middleware,
      ),
  });
  return { store, play };
}

const sounds = (play: ReturnType<typeof buildStore>['play']) =>
  play.mock.calls.map(([name]) => name);

describe('interaction sound listener', () => {
  it('plays the create sound when a person is added', async () => {
    const { store, play } = buildStore();
    await store.dispatch(
      addNode({ type: PERSON, attributeData: {}, currentStep: 1 }),
    );
    expect(sounds(play)).toEqual(['create-node']);
  });

  it('plays the discard sound when a person is removed', () => {
    const { store, play } = buildStore({ nodes: [person('a')] });
    store.dispatch(deleteNode('a'));
    expect(sounds(play)).toEqual(['discard']);
  });

  it('plays toggle sounds when a person is added to and taken off a question', async () => {
    const { store, play } = buildStore({ nodes: [person('a')] });
    await store.dispatch(
      addNodeToPrompt({ nodeId: 'a', promptAttributes: {}, currentStep: 1 }),
    );
    await store.dispatch(removeNodeFromPrompt({ nodeId: 'a', currentStep: 1 }));
    expect(sounds(play)).toEqual(['toggle-on', 'toggle-off']);
  });

  it('plays the connect sound when a connection is made, and toggle-off when it is removed', async () => {
    const { store, play } = buildStore({
      nodes: [person('a'), person('b')],
      edges: [knows('e', 'a', 'b')],
    });
    await store.dispatch(
      addEdge({ from: 'b', to: 'a', type: KNOWS, currentStep: 1 }),
    );
    store.dispatch(deleteEdge('e'));
    expect(sounds(play)).toEqual(['create-edge', 'toggle-off']);
  });

  it('plays one sound for each toggled connection, by what the toggle did', async () => {
    const { store, play } = buildStore({ nodes: [person('a'), person('b')] });
    await store.dispatch(
      toggleEdge({ from: 'a', to: 'b', type: KNOWS, currentStep: 1 }),
    );
    await store.dispatch(
      toggleEdge({ from: 'a', to: 'b', type: KNOWS, currentStep: 1 }),
    );
    expect(sounds(play)).toEqual(['create-edge', 'toggle-off']);
  });

  it('plays toggle sounds by the value a marked person is given', async () => {
    const { store, play } = buildStore({ nodes: [person('a')] });
    await store.dispatch(
      toggleNodeAttributes({
        nodeId: 'a',
        attributePatch: { set: { [CLOSE]: true }, unset: [] },
      }),
    );
    await store.dispatch(
      toggleNodeAttributes({
        nodeId: 'a',
        attributePatch: { set: { [CLOSE]: false }, unset: [] },
      }),
    );
    expect(sounds(play)).toEqual(['toggle-on', 'toggle-off']);
  });

  it('makes no sound for a change to a person’s answers, such as being placed in a bin', async () => {
    const { store, play } = buildStore({ nodes: [person('a')] });
    await store.dispatch(
      updateNode({
        nodeId: 'a',
        attributePatch: { set: { [BIN]: ['x'] }, unset: [] },
        currentStep: 1,
      }),
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('asks for one create sound when a family is added in one change', async () => {
    const { store, play } = buildStore();
    await store.dispatch(
      addNodesAndEdges({
        nodes: [
          { type: PERSON, modelData: { _uid: 'a' } },
          { type: PERSON, modelData: { _uid: 'b' } },
        ],
        edges: [{ from: 'a', to: 'b', type: KNOWS }],
        currentStep: 1,
      }),
    );
    expect(sounds(play)).toEqual(['create-node']);
  });

  it('plays the sound of the change an undo or redo makes', () => {
    const a = person('a');
    const b = person('b');
    const edge = knows('e', 'a', 'b');
    const { store, play } = buildStore({ nodes: [a] });

    store.dispatch(restoreNode(b));
    expect(sounds(play)).toEqual(['create-node']);

    play.mockClear();
    // Undoing an added family takes its people and connections away.
    store.dispatch(
      restoreNetwork({ nodes: [], edges: [], stageMetadata: undefined }),
    );
    expect(sounds(play)).toEqual(['discard']);

    play.mockClear();
    store.dispatch(
      restoreNetwork({
        nodes: [a, b],
        edges: [edge],
        stageMetadata: undefined,
      }),
    );
    expect(sounds(play)).toEqual(['create-node', 'create-edge']);

    play.mockClear();
    store.dispatch(
      restoreNetwork({ nodes: [a, b], edges: [], stageMetadata: undefined }),
    );
    expect(sounds(play)).toEqual(['toggle-off']);
  });
});

describe('interaction sounds heard through the engine', () => {
  async function withEngine(
    network: { nodes?: NcNode[]; edges?: NcEdge[] } = {},
  ) {
    const context = new FakeAudioContext();
    const engine = createSoundEngine({
      createAudioContext: () => context,
      loadSprite: () => Promise.resolve(new ArrayBuffer(8)),
      document,
      window,
    });
    engine.setEnabled(true);
    await settle();
    context.state = 'running';
    const { store } = buildStore(network, engine.play);
    const heard = () =>
      context.played.map((source) => {
        const offset = source.started?.[1];
        return Object.entries(INTERACTION_SOUND_SPRITE).find(
          ([, span]) => span.start === offset,
        )?.[0];
      });
    return { store, engine, heard };
  }

  it('plays removing a person with their connections as one discard', async () => {
    const { store, engine, heard } = await withEngine({
      nodes: [person('a'), person('b'), person('c')],
      edges: [knows('e1', 'a', 'b'), knows('e2', 'a', 'c')],
    });
    // As the Family Pedigree removes a person: their links, then them.
    store.dispatch(deleteEdge('e1'));
    store.dispatch(deleteEdge('e2'));
    store.dispatch(deleteNode('a'));
    await settle();
    expect(heard()).toEqual(['discard']);
    engine.dispose();
  });

  it('plays several people removed at once as one discard', async () => {
    const { store, engine, heard } = await withEngine({
      nodes: [person('a'), person('b'), person('c')],
    });
    for (const id of ['a', 'b', 'c']) store.dispatch(deleteNode(id));
    await settle();
    expect(heard()).toEqual(['discard']);
    engine.dispose();
  });

  it('plays an undone removal, which brings back a person and then their connections, as one create', async () => {
    const { store, engine, heard } = await withEngine({
      nodes: [person('b')],
    });
    store.dispatch(restoreNode(person('a')));
    await store.dispatch(
      addEdge({ from: 'a', to: 'b', type: KNOWS, currentStep: 1 }),
    );
    await settle();
    expect(heard()).toEqual(['create-node']);
    engine.dispose();
  });
});
