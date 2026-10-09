import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';
import {
  asEntityAttributeReference,
  type Codebook,
  type FormField,
  type Variable,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../contract/types';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  encryptionFor,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../interfaces/Anonymisation/utils';
import protocol from '../../store/modules/protocol';
import session, {
  restoreNode,
  type SessionState,
} from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';
const NAME_VAR = 'name';
const NICKNAME_VAR = 'nickname';
const NOTES_VAR = 'notes';
const NODE_ID = 'node-1';
const PASSPHRASE = 'protocol form passphrase';

const nameReference = asEntityAttributeReference(NAME_VAR);

// The variable whose validation uses each rule to name the encrypted name. A
// valid protocol can only name it with `sameAs` or `differentFrom` (the others
// need a number, date or scalar), but every rule that names a variable reads
// that variable's stored value, so each is covered.
const variableNamingNameBy: Record<
  (typeof VARIABLE_REFERENCE_VALIDATIONS)[number],
  string
> = {
  sameAs: 'confirm-name',
  differentFrom: NICKNAME_VAR,
  greaterThanVariable: 'greater',
  lessThanVariable: 'less',
  greaterThanOrEqualToVariable: 'at-least',
  lessThanOrEqualToVariable: 'at-most',
};

const variables: Record<string, Variable> = {
  [variableNamingNameBy.sameAs]: {
    name: 'confirm_name',
    label: 'confirm_name',
    type: 'text',
    component: 'Text',
    validation: { sameAs: nameReference },
  },
  [variableNamingNameBy.greaterThanVariable]: {
    name: 'greater',
    label: 'greater',
    type: 'number',
    component: 'Number',
    validation: { greaterThanVariable: nameReference },
  },
  [variableNamingNameBy.lessThanVariable]: {
    name: 'less',
    label: 'less',
    type: 'number',
    component: 'Number',
    validation: { lessThanVariable: nameReference },
  },
  [variableNamingNameBy.greaterThanOrEqualToVariable]: {
    name: 'at_least',
    label: 'at_least',
    type: 'number',
    component: 'Number',
    validation: { greaterThanOrEqualToVariable: nameReference },
  },
  [variableNamingNameBy.lessThanOrEqualToVariable]: {
    name: 'at_most',
    label: 'at_most',
    type: 'number',
    component: 'Number',
    validation: { lessThanOrEqualToVariable: nameReference },
  },
  [NAME_VAR]: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
    validation: { unique: true },
  },
  [NICKNAME_VAR]: {
    name: 'nickname',
    label: 'nickname',
    type: 'text',
    component: 'Text',
    validation: { differentFrom: nameReference },
  },
  [NOTES_VAR]: {
    name: 'notes',
    label: 'notes',
    type: 'text',
    component: 'Text',
  },
};

// The variables as a protocol re-imported without its encryption declares
// them: the name the interview stored encrypted is no longer marked.
const unmarkedVariables: Record<string, Variable> = {
  ...variables,
  [NAME_VAR]: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    validation: { unique: true },
  },
};

const codebookWith = (nodeVariables: Record<string, Variable>): Codebook => ({
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: nodeVariables,
    },
  },
  edge: {},
  ego: { variables: {} },
});

function fieldFor(variable: string): FormField[] {
  return [
    {
      variable: asEntityAttributeReference(variable),
      prompt: { en: 'Answer' },
    },
  ];
}

/**
 * The stored person, with their name encrypted for `boundTo`: their own id
 * unless the ciphertext was written for someone else.
 */
async function encryptedNode(
  boundTo = NODE_ID,
  { id = NODE_ID, name = 'Alice' } = {},
): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { [NAME_VAR]: name },
      variables,
      (await encryptionFor(PASSPHRASE)).key,
      boundTo,
    );
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

async function makeStore(
  nodes: NcNode[],
  unlocked: boolean,
  nodeVariables = variables,
) {
  const sessionState: SessionState = {
    id: 'session',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localePreference: null,
    locale: null,
    promptIndex: 0,
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego',
        [entityAttributesProperty]: {},
      },
      nodes,
      edges: [],
      encryption: (await encryptionFor(PASSPHRASE)).header,
    },
  };
  const protocolState: ProtocolPayload = {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    name: 'Encrypted form protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: codebookWith(nodeVariables),
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        label: { en: 'Name the people you know' },
        subject: { entity: 'node', type: NODE_TYPE },
        form: { title: { en: 'Add a person' }, fields: fieldFor(NOTES_VAR) },
        prompts: [{ id: 'prompt-1', text: { en: 'Name the people you know' } }],
      },
    ],
  };
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: { session: sessionState, protocol: protocolState },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  if (unlocked) await unlockWith(store, PASSPHRASE);
  return store;
}

function renderForm(
  store: Awaited<ReturnType<typeof makeStore>>,
  variable: string,
  currentEntityId?: string,
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <TestProtocolLocalization>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            {children}
          </CurrentStepProvider>
        </TestProtocolLocalization>
      </Provider>
    );
  }
  return renderHook(
    () => useProtocolForm({ fields: fieldFor(variable), currentEntityId }),
    { wrapper: Wrapper },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stored person as they are in a network the validators compare with. */
function nodeIn(network: unknown, nodeId = NODE_ID) {
  if (!isRecord(network)) return undefined;
  const { nodes } = network;
  if (!Array.isArray(nodes)) return undefined;
  const node: unknown = nodes.find(
    (candidate: unknown) =>
      isRecord(candidate) && candidate[entityPrimaryKeyProperty] === nodeId,
  );
  if (!isRecord(node) || !isRecord(node[entityAttributesProperty])) {
    return undefined;
  }
  return { [entityAttributesProperty]: node[entityAttributesProperty] };
}

/** The stored person as the first field's validators see them. */
function validatedNode(fieldComponents: ReactNode) {
  const element = Array.isArray(fieldComponents)
    ? fieldComponents[0]
    : fieldComponents;
  if (!isValidElement(element) || !isRecord(element.props)) return undefined;
  const { validationContext } = element.props;
  if (!isRecord(validationContext)) return undefined;
  return nodeIn(validationContext.network);
}

/** Waits for the network the first field's validators would compare with. */
async function resolveValidatedNetwork(fieldComponents: ReactNode) {
  const element = Array.isArray(fieldComponents)
    ? fieldComponents[0]
    : fieldComponents;
  if (!isValidElement(element) || !isRecord(element.props)) {
    throw new Error('Expected a field');
  }
  const { validationContext } = element.props;
  if (
    !isRecord(validationContext) ||
    typeof validationContext.resolveNetwork !== 'function'
  ) {
    throw new Error('Expected the validation to resolve its network');
  }
  return validationContext.resolveNetwork();
}

/** The value the first field's validators see for the stored person. */
function validatedValue(fieldComponents: ReactNode, variable: string) {
  return validatedNode(fieldComponents)?.[entityAttributesProperty][variable];
}

const comparisons: [string, string, string | undefined][] = [
  ['`unique` on an encrypted variable', NAME_VAR, undefined],
  ...VARIABLE_REFERENCE_VALIDATIONS.map((rule): [string, string, string] => [
    `\`${rule}\` naming an encrypted variable`,
    variableNamingNameBy[rule],
    NODE_ID,
  ]),
];

describe('useProtocolForm validating against encrypted values', () => {
  it.each(comparisons)(
    'compares %s with the plaintext of the stored value',
    async (_rule, variable, currentEntityId) => {
      const store = await makeStore([await encryptedNode()], true);
      const { result } = renderForm(store, variable, currentEntityId);

      await waitFor(() => {
        expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
          'Alice',
        );
      });
    },
  );

  it('compares with a person added while the comparison waited for decryption', async () => {
    const store = await makeStore([await encryptedNode()], true);
    const bob = await encryptedNode('node-2', { id: 'node-2', name: 'Bob' });
    const { result } = renderForm(store, NAME_VAR);

    const resolving = resolveValidatedNetwork(result.current.fieldComponents);
    act(() => {
      store.dispatch(restoreNode(bob));
    });
    const resolved = await resolving;

    expect(nodeIn(resolved, 'node-2')?.[entityAttributesProperty]).toEqual({
      [NAME_VAR]: 'Bob',
    });
  });

  it('leaves out a stored value its key cannot read, rather than comparing with its ciphertext', async () => {
    const store = await makeStore([await encryptedNode('elsewhere')], true);
    const { result } = renderForm(store, NAME_VAR);

    await waitFor(() => {
      expect(
        validatedNode(result.current.fieldComponents)?.[
          entityAttributesProperty
        ],
      ).toEqual({});
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it.each(comparisons)(
    'fails %s, asking for the passphrase, while the key is not in force, never using its ciphertext',
    async (_rule, variable, currentEntityId) => {
      const store = await makeStore([await encryptedNode()], false);
      const { result } = renderForm(store, variable, currentEntityId);

      expect(
        validatedNode(result.current.fieldComponents)?.[
          entityAttributesProperty
        ],
      ).toEqual({});
      await expect(
        resolveValidatedNetwork(result.current.fieldComponents),
      ).rejects.toThrow(
        createMessageError(runtimeMessages.protectedAnswersNotSaved),
      );
      expect(result.current.passphraseNeeded).toBe(true);
      expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    },
  );

  // The stored answers each rule reads: `unique` reads the others', and a rule
  // naming another variable reads the edited person's, so a new person's reads
  // none.
  const comparisonsReadingNoEncryptedValue: [
    string,
    string,
    string | undefined,
  ][] = [
    ['`unique` on the edited person’s own encrypted value', NAME_VAR, NODE_ID],
    ...VARIABLE_REFERENCE_VALIDATIONS.map(
      (rule): [string, string, undefined] => [
        `\`${rule}\` for a new person, though someone else’s value is encrypted`,
        variableNamingNameBy[rule],
        undefined,
      ],
    ),
    ...VARIABLE_REFERENCE_VALIDATIONS.map((rule): [string, string, string] => [
      `\`${rule}\` for a person whose value is not encrypted, though someone else’s is`,
      variableNamingNameBy[rule],
      'node-2',
    ]),
  ];

  it.each(comparisonsReadingNoEncryptedValue)(
    'needs no passphrase for %s',
    async (_rule, variable, currentEntityId) => {
      const node = await encryptedNode();
      const store = await makeStore(
        [
          node,
          {
            [entityPrimaryKeyProperty]: 'node-2',
            type: NODE_TYPE,
            [entityAttributesProperty]: { [NAME_VAR]: 'Bob' },
          },
        ],
        false,
      );
      const { result } = renderForm(store, variable, currentEntityId);

      expect(result.current.passphraseNeeded).toBe(false);
      expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
        node[entityAttributesProperty][NAME_VAR],
      );
      await expect(
        resolveValidatedNetwork(result.current.fieldComponents),
      ).rejects.toThrow('Expected the validation to resolve its network');
      expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    },
  );

  it.each(comparisons)(
    'compares %s with the plaintext of a value its record says is encrypted, though the codebook no longer marks it',
    async (_rule, variable, currentEntityId) => {
      const store = await makeStore(
        [await encryptedNode()],
        true,
        unmarkedVariables,
      );
      const { result } = renderForm(store, variable, currentEntityId);

      await waitFor(() => {
        expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
          'Alice',
        );
      });
    },
  );

  it.each(comparisons)(
    'fails %s, asking for the passphrase, while the key is not in force, though the codebook no longer marks the value encrypted',
    async (_rule, variable, currentEntityId) => {
      const store = await makeStore(
        [await encryptedNode()],
        false,
        unmarkedVariables,
      );
      const { result } = renderForm(store, variable, currentEntityId);

      expect(
        validatedNode(result.current.fieldComponents)?.[
          entityAttributesProperty
        ],
      ).toEqual({});
      await expect(
        resolveValidatedNetwork(result.current.fieldComponents),
      ).rejects.toThrow(
        createMessageError(runtimeMessages.protectedAnswersNotSaved),
      );
      expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    },
  );

  it('leaves a form that compares with no encrypted value on the stored network', async () => {
    const node = await encryptedNode();
    const store = await makeStore([node], false);
    const { result } = renderForm(store, NOTES_VAR, NODE_ID);

    expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
      node[entityAttributesProperty][NAME_VAR],
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
