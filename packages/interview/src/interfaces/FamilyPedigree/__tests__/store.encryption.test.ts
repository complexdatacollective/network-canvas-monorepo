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
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui, { setPassphrase } from '../../../store/modules/ui';
import { decryptData, isNumberArray } from '../../Anonymisation/utils';
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
          edge: { [config.edgeType]: { name: 'Family' } },
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
});
