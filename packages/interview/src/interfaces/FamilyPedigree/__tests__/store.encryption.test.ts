import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  isFamilyPedigreeStageMetadata,
  type NcNode,
} from '@codaco/shared-consts';

import { writeFailureMessage } from '../../../forms/writeSubmissionResult';
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import { setPassphrase, setPassphraseInvalid } from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
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

const stage: StageProps<'FamilyPedigree'>['stage'] = {
  id: 'pedigree',
  type: 'FamilyPedigree',
  label: 'Family Pedigree',
  censusPrompt: 'Build your pedigree.',
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

function makeReduxStore() {
  const reduxStore = createEncryptionStore([], [stage], nodeVariables, {
    edgeTypes: {
      [config.edgeType]: {
        name: 'Family',
        color: 'edge-color-seq-1',
        variables: edgeVariables,
      },
    },
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

/**
 * The node and edge counts of every session state the store passes through,
 * as a host persisting each change would see them.
 */
function watchNetworkStates(reduxStore: ReturnType<typeof makeReduxStore>) {
  const seen: [number, number][] = [];
  reduxStore.subscribe(() => {
    const { nodes, edges } = reduxStore.getState().session.network;
    seen.push([nodes.length, edges.length]);
  });
  return seen;
}

describe('finalizeNetwork with an encrypted name variable', () => {
  it('stores each name as ciphertext with its metadata', async () => {
    const reduxStore = makeReduxStore();
    const seen = watchNetworkStates(reduxStore);
    await buildFamily(reduxStore).getState().finalizeNetwork();

    // The whole family arrives in one change, never a person at a time.
    expect(seen).toContainEqual([2, 1]);
    expect(
      seen.every(
        ([nodes, edges]) =>
          (nodes === 0 && edges === 0) || (nodes === 2 && edges === 1),
      ),
    ).toBe(true);

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
    // A relative whose name is encrypted is labelled by relationship, as an
    // unnamed one is.
    expect(metadata.nodes?.map(({ label }) => label).toSorted()).toEqual([
      '',
      'Parent',
    ]);
    expect(JSON.stringify(metadata)).not.toMatch(/Mum|Sam/);
  });

  it('keeps names out of the labels derived for other relatives', async () => {
    const reduxStore = makeReduxStore();
    const store = buildFamily(reduxStore);
    const parentId = [...store.getState().network.nodes].find(
      ([, node]) =>
        node[entityAttributesProperty][config.nodeLabelVariable] === 'Mum',
    )?.[0];
    if (!parentId) throw new Error('Expected the named parent');
    // Unnamed, so labelled through the nearest named relative.
    const grandparentId = store.getState().addNode({
      attributes: { [config.egoVariable]: false },
    });
    store.getState().addEdge({
      from: grandparentId,
      to: parentId,
      attributes: {
        [config.relationshipTypeVariable]: ['biological'],
        [config.isActiveVariable]: true,
      },
    });

    await store.getState().finalizeNetwork();

    const metadata = reduxStore.getState().session.stageMetadata?.[0];
    if (!isFamilyPedigreeStageMetadata(metadata)) {
      throw new Error('Expected pedigree metadata');
    }
    expect(metadata.nodes?.map(({ label }) => label).toSorted()).toEqual([
      '',
      'Grandparent',
      'Parent',
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

    const seen = watchNetworkStates(reduxStore);
    const refused = await store.getState().finalizeNetwork();

    // Nothing of the family was ever in the session, even for a moment.
    expect(seen.every(([nodes, edges]) => nodes === 0 && edges === 0)).toBe(
      true,
    );

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
