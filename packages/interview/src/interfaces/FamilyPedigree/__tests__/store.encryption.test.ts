import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  isFamilyPedigreeStageMetadata,
  type NcNode,
} from '@codaco/shared-consts';

import { writeFailureMessage } from '../../../forms/writeSubmissionResult';
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import type { StageProps } from '../../../types';
import {
  createEncryptionStore,
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
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
    label: 'label',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [config.relationshipVariable]: {
    name: 'relationship',
    label: 'relationship',
    type: 'text',
  },
  [config.egoVariable]: { name: 'isEgo', label: 'isEgo', type: 'boolean' },
};

const edgeVariables: Record<string, Variable> = {
  [config.relationshipTypeVariable]: {
    name: 'relationshipType',
    label: 'relationshipType',
    type: 'categorical',
    options: [
      { label: { en: 'Biological' }, value: 'biological' },
      { label: { en: 'Social' }, value: 'social' },
    ],
  },
  [config.isActiveVariable]: {
    name: 'isActive',
    label: 'isActive',
    type: 'boolean',
  },
};

const encryptedVariableIds: ReadonlySet<string> = new Set([
  config.nodeLabelVariable,
]);

const stage: StageProps<'FamilyPedigree'>['stage'] = {
  id: 'pedigree',
  type: 'FamilyPedigree',
  label: { en: 'Family Pedigree' },
  censusPrompt: { en: 'Build your pedigree.' },
  framing: { mode: 'fixed', value: 'gendered' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
  nodeConfig: {
    type: config.nodeType,
    nodeLabelVariable: asEntityAttributeReference(config.nodeLabelVariable),
    egoVariable: asEntityAttributeReference(config.egoVariable),
    relationshipVariable: asEntityAttributeReference(
      config.relationshipVariable,
    ),
    biologicalSexVariable: asEntityAttributeReference(
      config.biologicalSexVariable,
    ),
  },
  edgeConfig: {
    type: config.edgeType,
    relationshipTypeVariable: asEntityAttributeReference(
      config.relationshipTypeVariable,
    ),
    isActiveVariable: asEntityAttributeReference(config.isActiveVariable),
    isGestationalCarrierVariable: asEntityAttributeReference(
      config.isGestationalCarrierVariable,
    ),
    gameteRoleVariable: asEntityAttributeReference(config.gameteRoleVariable),
  },
};

type ReduxStore = ReturnType<typeof createEncryptionStore>;

/**
 * An interview whose passphrase was chosen earlier, with its key in force
 * unless `locked`.
 */
async function makeReduxStore({ locked = false } = {}): Promise<ReduxStore> {
  const reduxStore = createEncryptionStore([], [stage], nodeVariables, {
    edgeTypes: {
      [config.edgeType]: {
        name: 'Family',
        label: { en: 'Family' },
        color: 'edge-color-seq-1',
        variables: edgeVariables,
      },
    },
    header: (await encryptionFor(PASSPHRASE)).header,
  });
  if (!locked) await unlockWith(reduxStore, PASSPHRASE);
  return reduxStore;
}

function buildFamily(reduxStore: ReduxStore) {
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

/**
 * The stored name, decrypted as every display path reads it: as the
 * ciphertext of this node's own name, stored with only an IV beside it.
 */
async function readStoredLabel(node: NcNode | undefined) {
  if (!node) throw new Error('Expected the node to exist');
  const stored = readEncryptedAttribute(
    node,
    config.nodeLabelVariable,
    nodeVariables,
  );
  if (stored?.status !== 'encrypted') {
    throw new Error('Expected a stored ciphertext');
  }
  expect(stored.value.nodeId).toBe(node[entityPrimaryKeyProperty]);
  expect(
    Object.keys(
      node[entitySecureAttributesMeta]?.[config.nodeLabelVariable] ?? {},
    ),
  ).toEqual(['iv']);
  const { key } = await encryptionFor(PASSPHRASE);
  return decryptValue(key, stored.value, stored.value);
}

describe('finalizeNetwork with an encrypted name variable', () => {
  it('stores each name as ciphertext bound to the node it is committed as', async () => {
    const reduxStore = await makeReduxStore();
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

  it('records each relative under the id their name was encrypted for', async () => {
    const reduxStore = await makeReduxStore();
    const store = buildFamily(reduxStore);
    await store.getState().finalizeNetwork();

    const { network, storeToReduxIdMap } = store.getState();
    const committed = reduxStore.getState().session.network.nodes;
    expect(storeToReduxIdMap.size).toBe(2);
    for (const [storeId, reduxId] of storeToReduxIdMap) {
      const name =
        network.nodes.get(storeId)?.[entityAttributesProperty][
          config.nodeLabelVariable
        ];
      const node = committed.find(
        (candidate) => candidate[entityPrimaryKeyProperty] === reduxId,
      );
      expect(await readStoredLabel(node)).toBe(name);
    }
  });

  it('keeps names out of the membership metadata', async () => {
    const reduxStore = await makeReduxStore();
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

  it('commits nothing while the interview is locked, and keeps the pedigree for another try', async () => {
    const reduxStore = await makeReduxStore({ locked: true });
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

    await unlockWith(reduxStore, PASSPHRASE);
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
