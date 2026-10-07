import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import {
  asEntityAttributeReference,
  type Codebook,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  isFamilyPedigreeStageMetadata,
  type NcEdge,
  type NcEncryptionHeader,
  type NcNode,
  type StageMetadata,
  type VariableValue,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import type { BeforeNextFunction, StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  outOfBoundsHeader,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../Anonymisation/utils';
import NarrativePedigreeView from '../../NarrativePedigree/components/NarrativePedigreeView';
import FamilyPedigree from '../FamilyPedigree';
import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import { FamilyPedigreeProvider } from '../FamilyPedigreeProvider';

// Records the node and variable of every value the interview tries to
// decrypt, so a test can tell one attempt from a loop of them.
const decryptAttempts = vi.hoisted(() => {
  const attempts: { nodeId: string; variableId: string }[] = [];
  return attempts;
});
vi.mock('../../Anonymisation/encryptionFormat', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../Anonymisation/encryptionFormat')
    >();
  return {
    ...actual,
    decryptValue: (...args: Parameters<typeof actual.decryptValue>) => {
      const [, , { nodeId, variableId }] = args;
      decryptAttempts.push({ nodeId, variableId });
      return actual.decryptValue(...args);
    },
  };
});

const MEASURED_SIZE = 96;
const measuredRect = {
  width: MEASURED_SIZE,
  height: MEASURED_SIZE,
  top: 0,
  left: 0,
  bottom: MEASURED_SIZE,
  right: MEASURED_SIZE,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};
const measuredSize = { inlineSize: MEASURED_SIZE, blockSize: MEASURED_SIZE };

// Reports every observed element at the measured size straight away.
class StubResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: measuredRect,
          borderBoxSize: [measuredSize],
          contentBoxSize: [measuredSize],
          devicePixelContentBoxSize: [measuredSize],
        },
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    measuredRect,
  );
});

const PASSPHRASE = 'pedigree passphrase';
const NODE_TYPE = 'person';
const EDGE_TYPE = 'family';
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const REL_VAR = 'relationshipToEgo';
const BIO_SEX_VAR = 'biologicalSex';
const NOMINATED_VAR = 'nominated';
const AFFECTED_VAR = 'affected';
const REL_TYPE_VAR = 'relationshipType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_VAR = 'gameteRole';
const DIAGNOSIS_VAR = 'diagnosis';

const nodeVariables: Record<string, Variable> = {
  [NAME_VAR]: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [EGO_VAR]: { name: 'isEgo', label: 'isEgo', type: 'boolean' },
  [REL_VAR]: {
    name: 'relationshipToEgo',
    label: 'relationshipToEgo',
    type: 'text',
  },
  [BIO_SEX_VAR]: {
    name: 'biologicalSex',
    label: 'biologicalSex',
    type: 'text',
  },
  [NOMINATED_VAR]: { name: 'nominated', label: 'nominated', type: 'boolean' },
  [AFFECTED_VAR]: { name: 'affected', label: 'affected', type: 'boolean' },
};

/**
 * A codebook under which the pedigree writes nothing encrypted, while a
 * question another stage asks about relatives is protected.
 */
const unprotectedPedigreeVariables: Record<string, Variable> = {
  ...nodeVariables,
  [NAME_VAR]: { name: 'name', label: 'name', type: 'text', component: 'Text' },
  [DIAGNOSIS_VAR]: {
    name: 'diagnosis',
    label: 'diagnosis',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const edgeTypes: Codebook['edge'] = {
  [EDGE_TYPE]: {
    name: 'Family',
    label: { en: 'Family' },
    color: 'edge-color-seq-1',
    variables: {
      [REL_TYPE_VAR]: {
        name: 'relationshipType',
        label: 'relationshipType',
        type: 'categorical',
        options: [
          { label: { en: 'Biological' }, value: 'biological' },
          { label: { en: 'Social' }, value: 'social' },
        ],
      },
      [IS_ACTIVE_VAR]: { name: 'isActive', label: 'isActive', type: 'boolean' },
    },
  },
};

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
  nominationPrompts: [
    {
      id: 'nominate',
      text: { en: 'Who has been unwell?' },
      variable: asEntityAttributeReference(NOMINATED_VAR),
    },
  ],
  nodeConfig: {
    type: NODE_TYPE,
    nodeLabelVariable: asEntityAttributeReference(NAME_VAR),
    egoVariable: asEntityAttributeReference(EGO_VAR),
    relationshipVariable: asEntityAttributeReference(REL_VAR),
    biologicalSexVariable: asEntityAttributeReference(BIO_SEX_VAR),
  },
  edgeConfig: {
    type: EDGE_TYPE,
    relationshipTypeVariable: asEntityAttributeReference(REL_TYPE_VAR),
    isActiveVariable: asEntityAttributeReference(IS_ACTIVE_VAR),
    isGestationalCarrierVariable: asEntityAttributeReference(IS_GEST_VAR),
    gameteRoleVariable: asEntityAttributeReference(GAMETE_VAR),
  },
};

const narrativeStage: StageProps<'NarrativePedigree'>['stage'] = {
  id: 'narrative',
  type: 'NarrativePedigree',
  label: { en: 'Family health' },
  sourceStageId: 'pedigree',
  showAtRiskStatuses: false,
  diseases: [
    {
      id: 'condition',
      label: { en: 'Condition' },
      color: 'node-color-seq-1',
      variable: asEntityAttributeReference(AFFECTED_VAR),
      inheritancePattern: 'autosomalDominant',
    },
  ],
};

async function encryptedNode(
  id: string,
  attributes: Record<string, VariableValue>,
  variables: Record<string, Variable> = nodeVariables,
): Promise<NcNode> {
  const { key } = await encryptionFor(PASSPHRASE);
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(attributes, variables, key, id);
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

/**
 * `node` holding the encrypted name of `source`: a ciphertext bound to
 * another node, which the interview's key can never decrypt here.
 */
function withNameOf(node: NcNode, source: NcNode): NcNode {
  const name = source[entityAttributesProperty][NAME_VAR];
  const secure = source[entitySecureAttributesMeta]?.[NAME_VAR];
  if (name === undefined || !secure) {
    throw new Error('Expected an encrypted name to copy');
  }
  return {
    ...node,
    [entityAttributesProperty]: {
      ...node[entityAttributesProperty],
      [NAME_VAR]: name,
    },
    [entitySecureAttributesMeta]: {
      ...node[entitySecureAttributesMeta],
      [NAME_VAR]: secure,
    },
  };
}

/**
 * A pedigree already committed by an earlier visit: ego and their mother,
 * with the header of the passphrase chosen then.
 */
async function committedPedigree({
  motherNameUnreadable = false,
  motherDiagnosis,
  variables = nodeVariables,
}: {
  motherNameUnreadable?: boolean;
  motherDiagnosis?: string;
  variables?: Record<string, Variable>;
} = {}) {
  const ego = await encryptedNode(
    'ego',
    { [NAME_VAR]: 'Sam', [EGO_VAR]: true },
    variables,
  );
  const mother = await encryptedNode(
    'mother',
    {
      [NAME_VAR]: 'Rosa',
      [EGO_VAR]: false,
      [BIO_SEX_VAR]: 'female',
      [REL_VAR]: 'Parent',
      [NOMINATED_VAR]: false,
      ...(motherDiagnosis === undefined
        ? {}
        : { [DIAGNOSIS_VAR]: motherDiagnosis }),
    },
    variables,
  );
  const nodes = [ego, motherNameUnreadable ? withNameOf(mother, ego) : mother];
  const edges: NcEdge[] = [
    {
      [entityPrimaryKeyProperty]: 'mother-ego',
      type: EDGE_TYPE,
      from: 'mother',
      to: 'ego',
      [entityAttributesProperty]: {
        [REL_TYPE_VAR]: ['biological'],
        [IS_ACTIVE_VAR]: true,
        [GAMETE_VAR]: ['egg'],
      },
    },
  ];
  const metadata: StageMetadata[string] = {
    isNetworkCommitted: true,
    edgeIdVersion: 1,
    nodes: [
      { id: 'ego', label: '', isEgo: true },
      { id: 'mother', label: 'Family Member', isEgo: false },
    ],
    edges: edges.map((edge) => ({
      id: edge._uid,
      from: edge.from,
      to: edge.to,
      attributes: edge[entityAttributesProperty],
    })),
  };
  const { header } = await encryptionFor(PASSPHRASE);
  return { nodes, edges, metadata, header };
}

type Store = ReturnType<typeof createEncryptionStore>;

async function makeStore({
  nodes = [],
  edges = [],
  metadata,
  header,
  variables = nodeVariables,
  unlocked,
}: {
  nodes?: NcNode[];
  edges?: NcEdge[];
  metadata?: StageMetadata[string];
  header?: NcEncryptionHeader;
  variables?: Record<string, Variable>;
  unlocked: boolean;
}): Promise<Store> {
  const store = createEncryptionStore(
    nodes,
    [stage, narrativeStage],
    variables,
    {
      edges,
      edgeTypes,
      header,
      ...(metadata ? { stageMetadata: { 0: metadata } } : {}),
    },
  );
  if (unlocked) await unlockWith(store, PASSPHRASE);
  return store;
}

function renderPedigree(
  store: Store,
  ui: ReactNode = (
    <FamilyPedigree
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />
  ),
) {
  const beforeNext: { current: BeforeNextFunction | null } = { current: null };
  const registerBeforeNext = (
    ...args: [BeforeNextFunction | null] | [string, BeforeNextFunction | null]
  ) => {
    beforeNext.current = args.length === 1 ? args[0] : args[1];
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <TestProtocolLocalization>
          <ContractProvider
            onFinish={vi.fn()}
            onRequestAsset={vi.fn()}
            flags={{ isE2E: false, isDevelopment: false }}
          >
            <InterviewI18nProvider requestedLocale="en">
              <DialogProvider>
                <DndStoreProvider>
                  <CurrentStepProvider
                    currentStep={0}
                    onStepChange={() => undefined}
                  >
                    <StageMetadataContext.Provider value={registerBeforeNext}>
                      {children}
                    </StageMetadataContext.Provider>
                  </CurrentStepProvider>
                </DndStoreProvider>
              </DialogProvider>
            </InterviewI18nProvider>
          </ContractProvider>
        </TestProtocolLocalization>
      </Provider>
    );
  }

  render(ui, { wrapper: Wrapper });

  return {
    moveToNomination: async () => {
      await act(async () => {
        await beforeNext.current?.('forwards', 'step');
      });
    },
    /** Whether the stage lets the participant move on from its first step. */
    canMoveOn: () =>
      act(async () => (await beforeNext.current?.('forwards', 'step')) ?? true),
  };
}

const passphraseNotice = /enter your passphrase to see and change/i;
const ciphertext = /\d+,\d+,\d+/;

describe('FamilyPedigree with an encrypted name variable', () => {
  it('asks for the passphrase and holds the pedigree until one is entered', async () => {
    const store = await makeStore({ unlocked: false });
    renderPedigree(store);

    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /build your family/i })).toBe(
      null,
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await act(() => unlockWith(store, PASSPHRASE));

    expect(
      await screen.findByRole('heading', { name: /build your family/i }),
    ).toBeTruthy();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
  });

  it('holds a pedigree from an earlier visit until the passphrase is entered again, then shows its names', async () => {
    const store = await makeStore({
      ...(await committedPedigree()),
      unlocked: false,
    });
    renderPedigree(store);

    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rosa' })).toBeNull();
    expect(screen.queryByText(ciphertext)).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await act(() => unlockWith(store, PASSPHRASE));

    expect(await screen.findByRole('button', { name: 'Rosa' })).toBeTruthy();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
  });

  it('shows decrypted names when revisiting and on the nomination steps', async () => {
    const store = await makeStore({
      ...(await committedPedigree()),
      unlocked: true,
    });
    const { moveToNomination } = renderPedigree(store);

    expect(await screen.findByRole('button', { name: 'Rosa' })).toBeTruthy();
    expect(screen.queryByText(ciphertext)).toBeNull();

    await moveToNomination();

    expect(await screen.findByText('Who has been unwell?')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Rosa' })).toBeTruthy();
    expect(screen.queryByText(ciphertext)).toBeNull();
  });

  it('shows a relative whose name cannot be read without it, once, and without asking for the passphrase again', async () => {
    decryptAttempts.length = 0;
    const store = await makeStore({
      ...(await committedPedigree({ motherNameUnreadable: true })),
      unlocked: true,
    });
    renderPedigree(store);

    // Labelled by relationship, as a relative without a name is; the name
    // copied onto them is never shown as theirs.
    expect(await screen.findByRole('button', { name: 'Mother' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sam' })).toBeNull();
    expect(screen.queryByText(ciphertext)).toBeNull();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    // Refused once and remembered: nothing tries it again, or asks for the
    // passphrase because of it. A loop would try again straight away.
    const attemptsOnMother = () =>
      decryptAttempts.filter(({ nodeId }) => nodeId === 'mother');
    await waitFor(() => expect(attemptsOnMother()).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(attemptsOnMother()).toHaveLength(1);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});

function SyncMetadataOnMount() {
  const syncMetadata = useFamilyPedigreeStore((state) => state.syncMetadata);
  useEffect(() => syncMetadata(), [syncMetadata]);
  return null;
}

describe('FamilyPedigree summary of a family whose names were stored encrypted', () => {
  it('names each relative by relationship, though the codebook no longer encrypts names', async () => {
    const committed = await committedPedigree();
    const store = await makeStore({
      ...committed,
      variables: unprotectedPedigreeVariables,
      unlocked: true,
    });
    renderPedigree(
      store,
      <FamilyPedigreeProvider nodes={committed.nodes} edges={committed.edges}>
        <SyncMetadataOnMount />
      </FamilyPedigreeProvider>,
    );

    await waitFor(() => {
      const metadata = store.getState().session.stageMetadata?.[0];
      if (!isFamilyPedigreeStageMetadata(metadata)) {
        throw new Error('Expected pedigree metadata');
      }
      expect(metadata.nodes?.map(({ label }) => label).toSorted()).toEqual([
        '',
        'Mother',
      ]);
    });
    expect(JSON.stringify(store.getState().session.stageMetadata)).not.toMatch(
      /Rosa|Sam/,
    );
  });
});

describe('FamilyPedigree under an encryption header no passphrase can open', () => {
  it('says why the pedigree cannot be built, without asking for a passphrase, and lets the participant move on', async () => {
    const { header } = await encryptionFor(PASSPHRASE);
    const store = await makeStore({
      header: outOfBoundsHeader(header),
      unlocked: false,
    });
    const { canMoveOn } = renderPedigree(store);

    expect(await screen.findByRole('status')).toHaveTextContent(
      /cannot be shown or saved in this interview/,
    );
    expect(screen.queryByRole('heading', { name: /build your family/i })).toBe(
      null,
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    expect(await canMoveOn()).toBe(true);
    expect(store.getState().session.network.nodes).toEqual([]);
  });

  it('opens a pedigree that writes nothing protected, and keeps the protected answers relatives already hold', async () => {
    const committed = await committedPedigree({
      motherDiagnosis: 'Asthma',
      variables: unprotectedPedigreeVariables,
    });
    const store = await makeStore({
      ...committed,
      header: outOfBoundsHeader(committed.header),
      variables: unprotectedPedigreeVariables,
      unlocked: false,
    });
    const storedMother = () => {
      const mother = store
        .getState()
        .session.network.nodes.find((node) => node._uid === 'mother');
      if (!mother) throw new Error('Expected the mother to be stored');
      return mother;
    };
    const before = storedMother();
    expect(before[entitySecureAttributesMeta]?.[DIAGNOSIS_VAR]).toBeDefined();
    const { moveToNomination } = renderPedigree(store);

    expect(await screen.findByRole('button', { name: 'Rosa' })).toBeTruthy();
    expect(screen.queryByText(/cannot be shown or saved/)).toBeNull();
    expect(screen.queryByText(/Asthma|\d+,\d+,\d+/)).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    await moveToNomination();
    await userEvent.click(await screen.findByRole('button', { name: 'Rosa' }));

    await waitFor(() =>
      expect(storedMother()[entityAttributesProperty][NOMINATED_VAR]).toBe(
        true,
      ),
    );
    const after = storedMother();
    expect(after[entityAttributesProperty][DIAGNOSIS_VAR]).toEqual(
      before[entityAttributesProperty][DIAGNOSIS_VAR],
    );
    expect(after[entitySecureAttributesMeta]).toEqual(
      before[entitySecureAttributesMeta],
    );
    expect(store.getState().session.network.nodes).toHaveLength(2);
  });
});

function renderNarrative(store: Store) {
  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <InterviewI18nProvider requestedLocale="en">
          <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
            <NarrativePedigreeView stage={narrativeStage} />
          </CurrentStepProvider>
        </InterviewI18nProvider>
      </TestProtocolLocalization>
    </Provider>,
  );
}

describe('NarrativePedigree reading an encrypted pedigree', () => {
  it('shows the decrypted names', async () => {
    const store = await makeStore({
      ...(await committedPedigree()),
      unlocked: true,
    });
    renderNarrative(store);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Condition' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Focus on Rosa' }),
    ).toBeTruthy();
    expect(screen.queryByText(ciphertext)).toBeNull();
  });

  it('shows a placeholder instead of names until the passphrase is entered', async () => {
    const store = await makeStore({
      ...(await committedPedigree()),
      unlocked: false,
    });
    renderNarrative(store);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Condition' }),
    );
    // The fallback label for a relative without a readable name.
    expect(
      await screen.findByRole('button', { name: 'Focus on Family Member' }),
    ).toBeTruthy();
    expect(screen.queryByText(ciphertext)).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });
});
