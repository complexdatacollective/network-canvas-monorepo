import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useContext } from 'react';
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
  type NcEdge,
  type NcNode,
  type StageMetadata,
  type VariableValue,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase } from '../../../store/modules/ui';
import type { BeforeNextFunction, StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../Anonymisation/utils';
import NarrativePedigreeView from '../../NarrativePedigree/components/NarrativePedigreeView';
import FamilyPedigree from '../FamilyPedigree';
import { FamilyPedigreeContext } from '../FamilyPedigreeContext';
import { FamilyPedigreeProvider } from '../FamilyPedigreeProvider';
import type { FamilyPedigreeStoreApi } from '../store';

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

const nodeVariables: Record<string, Variable> = {
  [NAME_VAR]: {
    name: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [EGO_VAR]: { name: 'isEgo', type: 'boolean' },
  [REL_VAR]: { name: 'relationshipToEgo', type: 'text' },
  [BIO_SEX_VAR]: { name: 'biologicalSex', type: 'text' },
  [NOMINATED_VAR]: { name: 'nominated', type: 'boolean' },
  [AFFECTED_VAR]: { name: 'affected', type: 'boolean' },
};

const edgeTypes: Codebook['edge'] = {
  [EDGE_TYPE]: { name: 'Family', color: 'edge-color-seq-1' },
};

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
  nominationPrompts: [
    {
      id: 'nominate',
      text: 'Who has been unwell?',
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
  label: 'Family health',
  sourceStageId: 'pedigree',
  showAtRiskStatuses: false,
  diseases: [
    {
      id: 'condition',
      label: 'Condition',
      color: 'node-color-seq-1',
      variable: asEntityAttributeReference(AFFECTED_VAR),
      inheritancePattern: 'autosomalDominant',
    },
  ],
};

async function encryptedNode(
  id: string,
  attributes: Record<string, VariableValue>,
): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(attributes, nodeVariables, PASSPHRASE);
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

/** A pedigree already committed by an earlier visit: ego and their mother. */
async function committedPedigree() {
  const nodes = [
    await encryptedNode('ego', { [NAME_VAR]: 'Sam', [EGO_VAR]: true }),
    await encryptedNode('mother', {
      [NAME_VAR]: 'Rosa',
      [EGO_VAR]: false,
      [BIO_SEX_VAR]: 'female',
      [REL_VAR]: 'Parent',
      [NOMINATED_VAR]: false,
    }),
  ];
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
  return { nodes, edges, metadata };
}

function makeStore({
  nodes = [],
  edges = [],
  metadata,
  withPassphrase,
  encryptionEnabled = true,
}: {
  nodes?: NcNode[];
  edges?: NcEdge[];
  metadata?: StageMetadata[string];
  withPassphrase: boolean;
  encryptionEnabled?: boolean;
}) {
  const store = createEncryptionStore(
    nodes,
    [stage, narrativeStage],
    nodeVariables,
    {
      edges,
      edgeTypes,
      encryptionEnabled,
      ...(metadata ? { stageMetadata: { 0: metadata } } : {}),
    },
  );
  if (withPassphrase) store.dispatch(setPassphrase(PASSPHRASE));
  return store;
}

function makeWrapper(
  store: ReturnType<typeof makeStore>,
  registerBeforeNext: (
    ...args: [BeforeNextFunction | null] | [string, BeforeNextFunction | null]
  ) => void = () => undefined,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
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
      </Provider>
    );
  };
}

function renderPedigree(store: ReturnType<typeof makeStore>) {
  const beforeNext: { current: BeforeNextFunction | null } = { current: null };
  const registerBeforeNext = (
    ...args: [BeforeNextFunction | null] | [string, BeforeNextFunction | null]
  ) => {
    beforeNext.current = args.length === 1 ? args[0] : args[1];
  };

  render(
    <FamilyPedigree
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: makeWrapper(store, registerBeforeNext) },
  );

  return {
    moveToNomination: async () => {
      await act(async () => {
        await beforeNext.current?.('forwards', 'step');
      });
    },
  };
}

const passphraseNotice = /enter your passphrase to see and change/i;
const ciphertext = /\d+,\d+,\d+/;

describe('FamilyPedigree with an encrypted name variable', () => {
  it('asks for the passphrase and holds the pedigree until one is entered', async () => {
    const store = makeStore({ withPassphrase: false });
    renderPedigree(store);

    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /build your family/i })).toBe(
      null,
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });

    expect(
      await screen.findByRole('heading', { name: /build your family/i }),
    ).toBeTruthy();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
  });

  it('shows decrypted names when revisiting and on the nomination steps', async () => {
    const store = makeStore({
      ...(await committedPedigree()),
      withPassphrase: true,
    });
    const { moveToNomination } = renderPedigree(store);

    expect(await screen.findByRole('button', { name: 'Rosa' })).toBeTruthy();
    expect(screen.queryByText(ciphertext)).toBeNull();

    await moveToNomination();

    expect(await screen.findByText('Who has been unwell?')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Rosa' })).toBeTruthy();
    expect(screen.queryByText(ciphertext)).toBeNull();
  });
});

describe('FamilyPedigree while the encryptedVariables experiment is off', () => {
  it('opens the pedigree without asking for a passphrase', async () => {
    const store = makeStore({
      withPassphrase: false,
      encryptionEnabled: false,
    });
    renderPedigree(store);

    expect(
      await screen.findByRole('heading', { name: /build your family/i }),
    ).toBeTruthy();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('commits names as plaintext', async () => {
    const store = makeStore({
      withPassphrase: false,
      encryptionEnabled: false,
    });
    let pedigreeStore: FamilyPedigreeStoreApi | undefined;
    function StoreProbe() {
      pedigreeStore = useContext(FamilyPedigreeContext);
      return null;
    }
    render(
      <FamilyPedigreeProvider nodes={[]} edges={[]}>
        <StoreProbe />
      </FamilyPedigreeProvider>,
      { wrapper: makeWrapper(store) },
    );
    if (!pedigreeStore) throw new Error('Expected the pedigree store');

    const pedigree = pedigreeStore.getState();
    const egoId = pedigree.addNode({
      attributes: { [EGO_VAR]: true, [NAME_VAR]: 'Sam' },
    });
    const motherId = pedigree.addNode({
      attributes: { [EGO_VAR]: false, [NAME_VAR]: 'Rosa' },
    });
    pedigree.addEdge({
      from: motherId,
      to: egoId,
      attributes: { [REL_TYPE_VAR]: ['biological'], [IS_ACTIVE_VAR]: true },
    });
    await act(async () => {
      await pedigree.finalizeNetwork();
    });

    const stored = store.getState().session.network.nodes;
    expect(
      new Set(stored.map((node) => node[entityAttributesProperty][NAME_VAR])),
    ).toEqual(new Set(['Rosa', 'Sam']));
    expect(stored.every((node) => !node[entitySecureAttributesMeta])).toBe(
      true,
    );
  });
});

function renderNarrative(store: ReturnType<typeof makeStore>) {
  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
          <NarrativePedigreeView stage={narrativeStage} />
        </CurrentStepProvider>
      </InterviewI18nProvider>
    </Provider>,
  );
}

describe('NarrativePedigree reading an encrypted pedigree', () => {
  it('shows the decrypted names', async () => {
    const store = makeStore({
      ...(await committedPedigree()),
      withPassphrase: true,
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
    const store = makeStore({
      ...(await committedPedigree()),
      withPassphrase: false,
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
