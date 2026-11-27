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
  type NcNode,
  type StageMetadata,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';
import { createInitialNetwork } from '../../../contract/network';
import type { InterviewPayload, SyncHandler } from '../../../contract/types';
import { store as createStore } from '../../../store/store';
import { deriveInterviewKey } from '../encryptionFormat';
import { installEncryptionKey } from '../unlockEncryption';
import { generateSecureAttributes } from '../utils';

export const NODE_TYPE = testTypeId('person');

/** The ids of the person's variables. */
export const NAME_VARIABLE = testVariableId('name');
export const NICKNAME_VARIABLE = testVariableId('nickname');
export const AGE_VARIABLE = testVariableId('age');

export const encryptedVariables: Record<string, Variable> = {
  [NAME_VARIABLE]: {
    name: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [NICKNAME_VARIABLE]: {
    name: 'nickname',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [AGE_VARIABLE]: { name: 'age', type: 'number', component: 'Number' },
};

const personDefinition = {
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: encryptedVariables,
} satisfies NonNullable<Codebook['node']>[string];

/** The id of the session every store made here runs under. */
const SESSION_ID = 'session-1';

type Encryption = { key: CryptoKey };

const encryptions = new Map<string, Promise<Encryption>>();

/**
 * The key of an interview protected with `passphrase`, by default the one
 * every store made here runs under. Deriving a key is deliberately slow, so
 * it is done once per passphrase and interview, and shared by every test in
 * the file.
 */
export function encryptionFor(
  passphrase: string,
  interviewId: string = SESSION_ID,
): Promise<Encryption> {
  const cacheKey = JSON.stringify([passphrase, interviewId]);
  const cached = encryptions.get(cacheKey);
  if (cached) return cached;
  const encryption = deriveInterviewKey(passphrase, interviewId).then(
    (key) => ({ key }),
  );
  encryptions.set(cacheKey, encryption);
  return encryption;
}

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
      { [NAME_VARIABLE]: name, [AGE_VARIABLE]: 40 },
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
    id: testId('stage-1'),
    type: 'NameGenerator',
    label: { en: 'Name generator' },
    subject: { entity: 'node', types: [NODE_TYPE] },
    form: {
      title: { en: 'Add a person' },
      fields: [
        {
          id: testId('field-1'),
          variable: asEntityAttributeReference(NAME_VARIABLE),
          prompt: { en: 'Name' },
        },
        {
          id: testId('field-2'),
          variable: asEntityAttributeReference(AGE_VARIABLE),
          prompt: { en: 'Age' },
        },
      ],
    },
    prompts: [{ id: testId('prompt-1'), text: { en: 'Name people' } }],
  },
];

/** An alter form asking for an encrypted and an unencrypted answer. */
export const alterFormStages: Stages = [
  {
    id: testId('alter-form'),
    type: 'AlterForm',
    label: { en: 'Alter form' },
    subject: { entity: 'node', types: [NODE_TYPE] },
    form: {
      fields: [
        {
          id: testId('field-1'),
          variable: asEntityAttributeReference(NAME_VARIABLE),
          prompt: { en: 'Name' },
        },
        {
          id: testId('field-2'),
          variable: asEntityAttributeReference(AGE_VARIABLE),
          prompt: { en: 'Age' },
        },
      ],
    },
  },
  {
    id: testId('next-screen'),
    type: 'Information',
    label: { en: 'Next screen' },
    content: { en: '# Next screen' },
  },
];

type EncryptionStoreOptions = {
  edges?: NcEdge[];
  edgeTypes?: Codebook['edge'];
  stageMetadata?: StageMetadata;
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
    onSync = () => Promise.resolve(),
  }: EncryptionStoreOptions = {},
) {
  const payload: InterviewPayload = {
    session: {
      id: SESSION_ID,
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localeOptions: [getLocaleMetadata('en')],
      network: {
        ...createInitialNetwork(),
        nodes,
        edges,
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
        // Each layout a stage places nodes in.
        layouts: Object.fromEntries(
          stages.flatMap((stage) =>
            stage.type === 'Sociogram' || stage.type === 'NetworkComposer'
              ? [[stage.layout, { name: `layout_${stage.id}` }]]
              : [],
          ),
        ),
      },
      stages,
    },
  };

  return createStore(payload, {
    onSync,
  });
}
