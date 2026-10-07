import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  isFamilyPedigreeStageMetadata,
  type NcNode,
} from '@codaco/shared-consts';

import { createInitialNetwork } from '../../../contract/network';
import { writeFailureMessage } from '../../../forms/writeSubmissionResult';
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui, {
  setPassphrase,
  setPassphraseInvalid,
} from '../../../store/modules/ui';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import { decryptData } from '../../Anonymisation/utils';
import { createFamilyPedigreeStore, type VariableConfig } from '../store';

const PASSPHRASE = 'pedigree passphrase';

const config: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

const nodeVariables: Record<string, Variable> = {
  [config.nodeLabelVariable]: {
    name: 'label',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [config.relationshipVariable]: { name: 'relationship', type: 'text' },
  [config.egoVariable]: { name: 'isEgo', type: 'boolean' },
};

const edgeVariables: Record<string, Variable> = {
  [config.relationshipTypeVariable]: {
    name: 'relationshipType',
    type: 'categorical',
    options: [
      { label: 'Biological', value: 'biological' },
      { label: 'Social', value: 'social' },
    ],
  },
  [config.isActiveVariable]: { name: 'isActive', type: 'boolean' },
};

const encryptedVariableIds: ReadonlySet<string> = new Set([
  config.nodeLabelVariable,
]);

function makeReduxStore() {
  const reduxStore = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: createInitialNetwork(),
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        experiments: { encryptedVariables: true },
        codebook: {
          node: {
            [config.nodeType]: { name: 'Person', variables: nodeVariables },
          },
          edge: {
            [config.edgeType]: { name: 'Family', variables: edgeVariables },
          },
        },
        stages: [{ id: 'pedigree', type: 'FamilyPedigree' }],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
  reduxStore.dispatch(setPassphrase(PASSPHRASE));
  return reduxStore;
}

function buildFamily(reduxStore: ReturnType<typeof makeReduxStore>) {
  const store = createFamilyPedigreeStore(
    new Map(),
    new Map(),
    new Map(),
    config,
    reduxStore.dispatch,
    0,
    new Set(),
    new Set(),
    null,
    'fixed',
    encryptedVariableIds,
  );
  const egoId = store.getState().addNode({
    attributes: {
      [config.egoVariable]: true,
      [config.nodeLabelVariable]: 'Sam',
    },
  });
  const parentId = store.getState().addNode({
    attributes: {
      [config.egoVariable]: false,
      [config.nodeLabelVariable]: 'Mum',
    },
  });
  store.getState().addEdge({
    from: parentId,
    to: egoId,
    attributes: {
      [config.relationshipTypeVariable]: ['biological'],
      [config.isActiveVariable]: true,
    },
  });
  return store;
}

async function readStoredLabel(node: NcNode | undefined) {
  if (!node) throw new Error('Expected the node to exist');
  const value = node[entityAttributesProperty][config.nodeLabelVariable];
  const secure = node[entitySecureAttributesMeta]?.[config.nodeLabelVariable];
  if (!isNumberArray(value)) throw new Error('Expected a stored ciphertext');
  if (!secure) throw new Error('Expected secure-attribute metadata');
  return decryptData({ secureAttributes: secure, data: value }, PASSPHRASE);
}

describe('finalizeNetwork with an encrypted name variable', () => {
  it('stores each name as ciphertext with its metadata', async () => {
    const reduxStore = makeReduxStore();
    await buildFamily(reduxStore).getState().finalizeNetwork();

    const nodes = reduxStore.getState().session.network.nodes;
    expect(nodes).toHaveLength(2);
    const parent = nodes.find(
      (node) => node[entityAttributesProperty][config.egoVariable] === false,
    );
    expect(await readStoredLabel(parent)).toBe('Mum');
    // Only encrypted variables are stored as ciphertext.
    expect(
      parent?.[entityAttributesProperty][config.relationshipVariable],
    ).toBe('Parent');
  });

  it('keeps names out of the membership metadata', async () => {
    const reduxStore = makeReduxStore();
    await buildFamily(reduxStore).getState().finalizeNetwork();

    const metadata = reduxStore.getState().session.stageMetadata?.[0];
    if (!isFamilyPedigreeStageMetadata(metadata)) {
      throw new Error('Expected pedigree metadata');
    }
    // Unnamed relatives fall back to a relationship label, as before.
    expect(metadata.nodes?.map(({ label }) => label).toSorted()).toEqual([
      '',
      'Family Member',
    ]);
    expect(JSON.stringify(metadata)).not.toMatch(/Mum|Sam/);
  });

  it('commits nothing when a name cannot be saved, and keeps the pedigree for another try', async () => {
    const reduxStore = makeReduxStore();
    reduxStore.dispatch(setPassphraseInvalid(true));
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      config,
      reduxStore.dispatch,
      0,
      new Set(),
      new Set(),
      null,
      'fixed',
      encryptedVariableIds,
    );
    // An unnamed relative first: it needs no passphrase, so it is written
    // before the named one is refused.
    const siblingId = store.getState().addNode({
      attributes: { [config.egoVariable]: false },
    });
    const egoId = store.getState().addNode({
      attributes: {
        [config.egoVariable]: true,
        [config.nodeLabelVariable]: 'Sam',
      },
    });
    store.getState().addEdge({
      from: siblingId,
      to: egoId,
      attributes: { [config.relationshipTypeVariable]: ['social'] },
    });

    const refused = await store.getState().finalizeNetwork();

    expect(refused && writeFailureMessage(refused)).toBe(
      runtimeMessages.protectedAnswersNotSaved,
    );
    const { network, stageMetadata } = reduxStore.getState().session;
    expect(network.nodes).toEqual([]);
    expect(network.edges).toEqual([]);
    expect(stageMetadata?.[0]).toBeUndefined();
    expect(
      store.getState().network.nodes.get(egoId)?.[entityAttributesProperty][
        config.nodeLabelVariable
      ],
    ).toBe('Sam');
    expect(store.getState().nodeMetadata.get(siblingId)?.readOnly).toBe(false);

    reduxStore.dispatch(setPassphraseInvalid(false));
    expect(await store.getState().finalizeNetwork()).toBeUndefined();

    const saved = reduxStore.getState().session.network;
    expect(saved.nodes).toHaveLength(2);
    expect(saved.edges).toHaveLength(1);
    const ego = saved.nodes.find(
      (node) => node[entityAttributesProperty][config.egoVariable] === true,
    );
    expect(await readStoredLabel(ego)).toBe('Sam');
  });
});
