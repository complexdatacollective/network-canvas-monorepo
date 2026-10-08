import {
  asEntityAttributeReference,
  type Codebook,
  getLocaleMetadata,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcEncryptionHeader,
  type NcNode,
  type StageMetadata,
} from '@codaco/shared-consts';

import { createInitialNetwork } from '../../../contract/network';
import type { InterviewPayload, SyncHandler } from '../../../contract/types';
import { store as createStore } from '../../../store/store';
import { createEncryptionHeader } from '../encryptionFormat';
import { installEncryptionKey } from '../unlockEncryption';
import { generateSecureAttributes } from '../utils';

export const NODE_TYPE = 'person';

export const encryptedVariables: Record<string, Variable> = {
  name: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  nickname: {
    name: 'nickname',
    label: 'nickname',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  age: { name: 'age', label: 'age', type: 'number', component: 'Number' },
};

const personDefinition = {
  name: 'Person',
  label: { en: 'Person' },
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: encryptedVariables,
} satisfies NonNullable<Codebook['node']>[string];

type Encryption = { header: NcEncryptionHeader; key: CryptoKey };

const encryptions = new Map<string, Promise<Encryption>>();

/**
 * The encryption header and key of an interview protected with `passphrase`.
 * Deriving a key is deliberately slow, so it is done once per passphrase and
 * shared by every test in the file.
 */
export function encryptionFor(passphrase: string): Promise<Encryption> {
  const cached = encryptions.get(passphrase);
  if (cached) return cached;
  const encryption = createEncryptionHeader(passphrase);
  encryptions.set(passphrase, encryption);
  return encryption;
}

/**
 * `header` as a corrupt or tampered copy might store it, asking for far more
 * key derivation work than the runtime allows, so that no passphrase is ever
 * checked against it.
 */
export const outOfBoundsHeader = (
  header: NcEncryptionHeader,
): NcEncryptionHeader => ({
  ...header,
  kdf: { ...header.kdf, iterations: 1_000_000_000 },
});

/**
 * Puts the key of `passphrase` in force in `store`, as entering it would,
 * without deriving it again.
 */
export async function unlockWith(
  store: Parameters<typeof installEncryptionKey>[0],
  passphrase: string,
): Promise<void> {
  installEncryptionKey(store, (await encryptionFor(passphrase)).key);
}

/** A person whose `name` is encrypted with the key of `passphrase`. */
export async function makeEncryptedPerson(
  id: string,
  name: string,
  passphrase: string,
): Promise<NcNode> {
  const { key } = await encryptionFor(passphrase);
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { name, age: 40 },
      encryptedVariables,
      key,
      id,
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
    label: { en: 'Name generator' },
    subject: { entity: 'node', type: NODE_TYPE },
    form: {
      title: { en: 'Add a person' },
      fields: [
        {
          variable: asEntityAttributeReference('name'),
          prompt: { en: 'Name' },
        },
        { variable: asEntityAttributeReference('age'), prompt: { en: 'Age' } },
      ],
    },
    prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
  },
];

/** An alter form asking for an encrypted and an unencrypted answer. */
export const alterFormStages: Stages = [
  {
    id: 'alter-form',
    type: 'AlterForm',
    label: { en: 'Alter form' },
    subject: { entity: 'node', type: NODE_TYPE },
    introductionPanel: {
      title: { en: 'About each person' },
      text: { en: 'Intro' },
    },
    form: {
      fields: [
        {
          variable: asEntityAttributeReference('name'),
          prompt: { en: 'Name' },
        },
        { variable: asEntityAttributeReference('age'), prompt: { en: 'Age' } },
      ],
    },
  },
  {
    id: 'next-screen',
    type: 'Information',
    label: { en: 'Next screen' },
    title: { en: 'Next screen' },
    items: [],
  },
];

type EncryptionStoreOptions = {
  edges?: NcEdge[];
  edgeTypes?: Codebook['edge'];
  stageMetadata?: StageMetadata;
  /**
   * The interview's encryption header, once a passphrase has been chosen in
   * it (from `encryptionFor`). Without one, the next passphrase entered is
   * the first.
   */
  header?: NcEncryptionHeader;
  /** Receives every session the interview hands the host to persist. */
  onSync?: SyncHandler;
};

/**
 * A real interview store holding `nodes`, as an interview that has just been
 * mounted (or resumed) would have it: no key in memory.
 */
export function createEncryptionStore(
  nodes: NcNode[],
  stages: Stages = nameGeneratorStages,
  variables: Record<string, Variable> = encryptedVariables,
  {
    edges = [],
    edgeTypes,
    stageMetadata,
    header,
    onSync = () => Promise.resolve(),
  }: EncryptionStoreOptions = {},
) {
  const payload: InterviewPayload = {
    session: {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localePreference: null,
      locale: null,
      localeOptions: [getLocaleMetadata('en')],
      network: {
        ...createInitialNetwork(),
        nodes,
        edges,
        ...(header ? { encryption: header } : {}),
      },
      ...(stageMetadata ? { stageMetadata } : {}),
    },
    protocol: {
      id: 'protocol-1',
      hash: 'hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Encryption protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      assets: [],
      codebook: {
        node: {
          [NODE_TYPE]: { ...personDefinition, variables },
        },
        ...(edgeTypes ? { edge: edgeTypes } : {}),
      },
      stages,
    },
  };

  return createStore(payload, {
    onSync,
    onProtocolLocaleChange: () => Promise.resolve(),
  });
}
