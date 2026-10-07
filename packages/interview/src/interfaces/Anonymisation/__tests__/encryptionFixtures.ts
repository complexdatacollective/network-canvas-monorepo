import {
  asEntityAttributeReference,
  type Codebook,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { createInitialNetwork } from '../../../contract/network';
import type { InterviewPayload } from '../../../contract/types';
import { store as createStore } from '../../../store/store';
import { generateSecureAttributes } from '../utils';

export const NODE_TYPE = 'person';

export const encryptedVariables: Record<string, Variable> = {
  name: { name: 'name', type: 'text', component: 'Text', encrypted: true },
  nickname: {
    name: 'nickname',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  age: { name: 'age', type: 'number', component: 'Number' },
};

export const personDefinition = {
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: encryptedVariables,
} satisfies NonNullable<Codebook['node']>[string];

/** A person whose `name` is encrypted with `passphrase`. */
export async function makeEncryptedPerson(
  id: string,
  name: string,
  passphrase: string,
): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { name, age: 40 },
      encryptedVariables,
      passphrase,
    );

  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

type Stages = InterviewPayload['protocol']['stages'];

const nameGeneratorStages: Stages = [
  {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: NODE_TYPE },
    form: {
      title: 'Add a person',
      fields: [
        { variable: asEntityAttributeReference('name'), prompt: 'Name' },
        { variable: asEntityAttributeReference('age'), prompt: 'Age' },
      ],
    },
    prompts: [{ id: 'prompt-1', text: 'Name people' }],
  },
];

/** An alter form asking for an encrypted and an unencrypted answer. */
export const alterFormStages: Stages = [
  {
    id: 'alter-form',
    type: 'AlterForm',
    label: 'Alter form',
    subject: { entity: 'node', type: NODE_TYPE },
    introductionPanel: { title: 'About each person', text: 'Intro' },
    form: {
      fields: [
        { variable: asEntityAttributeReference('name'), prompt: 'Name' },
        { variable: asEntityAttributeReference('age'), prompt: 'Age' },
      ],
    },
  },
  {
    id: 'next-screen',
    type: 'Information',
    label: 'Next screen',
    title: 'Next screen',
    items: [],
  },
];

/**
 * A real interview store holding `nodes`, as an interview that has just been
 * mounted (or resumed) would have it: no passphrase in memory.
 */
export function createEncryptionStore(
  nodes: NcNode[],
  stages: Stages = nameGeneratorStages,
  variables: Record<string, Variable> = encryptedVariables,
) {
  const payload: InterviewPayload = {
    session: {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      network: { ...createInitialNetwork(), nodes },
    },
    protocol: {
      id: 'protocol-1',
      hash: 'hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Encryption protocol',
      schemaVersion: 9,
      assets: [],
      codebook: {
        node: {
          [NODE_TYPE]: { ...personDefinition, variables },
        },
      },
      stages,
    },
  };

  return createStore(payload, { onSync: () => Promise.resolve() });
}
