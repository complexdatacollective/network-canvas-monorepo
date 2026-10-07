import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase, setPassphraseInvalid } from '../../../store/modules/ui';
import { interviewToastManager } from '../../../toast/interviewToastManager';
import type { StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import {
  decryptData,
  generateSecureAttributes,
} from '../../Anonymisation/utils';
import CategoricalBin from '../CategoricalBin';
import { getCatBinDropTargetId } from '../components/CategoricalBinItem';

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// Records when a list holding encrypted values has been decrypted, so a test
// can wait for stored values to be readable before relying on them.
const decryption = vi.hoisted(() => ({ ready: false }));
vi.mock('../../Anonymisation/useDecryptedNodes', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../Anonymisation/useDecryptedNodes')
    >();
  return {
    ...actual,
    useDecryptedNodes: (
      ...args: Parameters<typeof actual.useDecryptedNodes>
    ) => {
      const result = actual.useDecryptedNodes(...args);
      if (result.status === 'ready' && result.nodes !== args[0]) {
        decryption.ready = true;
      }
      return result;
    },
  };
});

// jsdom has neither observer; the bins and the dialog use them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const STAGE_ID = 'categorical-bin-stage';
const PROMPT_ID = 'prompt-1';
// One option, so the "other" bin is the second.
const OTHER_BIN_INDEX = 1;

const variables: Record<string, Variable> = {
  name: { name: 'name', type: 'text', component: 'Text' },
  category: {
    name: 'Category',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [{ label: 'Family', value: 1 }],
  },
  otherReason: {
    name: 'Other reason',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const stage: StageProps<'CategoricalBin'>['stage'] = {
  id: STAGE_ID,
  type: 'CategoricalBin',
  label: 'Categorise people',
  subject: { entity: 'node', type: 'person' },
  prompts: [
    {
      id: PROMPT_ID,
      text: 'Which category?',
      variable: asEntityAttributeReference('category'),
      otherVariable: asEntityAttributeReference('otherReason'),
      otherVariablePrompt: 'Please specify',
      otherOptionLabel: 'Other',
    },
  ],
};

const person: NcNode = {
  [entityPrimaryKeyProperty]: 'n1',
  type: 'person',
  [entityAttributesProperty]: { name: 'Alice' },
};

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

function renderCategoricalBin(
  passphrase?: string,
  {
    others = [],
    stageVariables = variables,
  }: { others?: NcNode[]; stageVariables?: Record<string, Variable> } = {},
) {
  const store = createEncryptionStore(
    [person, ...others],
    [stage],
    stageVariables,
  );
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  let dndStore: StoreApi<DndStore> | undefined;
  render(
    <InterviewI18nProvider requestedLocale="en">
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DialogProvider>
            <DndStoreProvider>
              <CaptureDndStore
                onStore={(captured) => {
                  dndStore = captured;
                }}
              />
              <CategoricalBin
                stage={stage}
                getNavigationHelpers={() => ({
                  moveForward: () => {},
                  moveBackward: () => {},
                })}
              />
            </DndStoreProvider>
          </DialogProvider>
        </CurrentStepProvider>
      </Provider>
    </InterviewI18nProvider>,
  );

  const dropIntoOther = async () => {
    const target = getCatBinDropTargetId(STAGE_ID, PROMPT_ID, OTHER_BIN_INDEX);
    act(() => {
      dndStore?.getState().startDrag(
        {
          id: person[entityPrimaryKeyProperty],
          type: 'NODE',
          metadata: person,
          _sourceZone: null,
        },
        { x: 0, y: 0, width: 10, height: 10 },
      );
    });
    await waitFor(() =>
      expect(dndStore?.getState().getDropTargetState(target)?.canDrop).toBe(
        true,
      ),
    );
    act(() => {
      dndStore?.getState().setActiveDropTarget(target);
      dndStore?.getState().endDrag();
    });
  };

  return { store, dropIntoOther };
}

describe('CategoricalBin asking for an encrypted "other" answer', () => {
  it('asks for the passphrase instead of taking an answer it could not save', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, dropIntoOther } = renderCategoricalBin();
    const before = store.getState().session.network;

    await dropIntoOther();

    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          'Some answers here are protected by your passphrase.',
        ),
      }),
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(store.getState().session.network).toBe(before);
  });

  it('saves the answer encrypted once the passphrase is in force', async () => {
    const { store, dropIntoOther } = renderCategoricalBin('pw');

    await dropIntoOther();
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Cousin' },
    });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() =>
      expect(
        isNumberArray(
          store.getState().session.network.nodes[0]?.[entityAttributesProperty]
            .otherReason,
        ),
      ).toBe(true),
    );
    const [saved] = store.getState().session.network.nodes;
    const data = saved?.[entityAttributesProperty].otherReason;
    const secureAttributes = saved?.[entitySecureAttributesMeta]?.otherReason;
    if (!secureAttributes || !isNumberArray(data)) return;
    await expect(decryptData({ secureAttributes, data }, 'pw')).resolves.toBe(
      'Cousin',
    );
  });

  it('keeps the answer being entered, and says it was not saved, when the passphrase stops working', async () => {
    const { store, dropIntoOther } = renderCategoricalBin('pw');
    const before = store.getState().session.network;

    await dropIntoOther();
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Cousin' },
    });
    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    expect(
      await screen.findByText(
        'Your answers have not been saved. Enter your passphrase, then try again.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('Cousin');
    expect(store.getState().session.network).toBe(before);
  });
});

describe('CategoricalBin validating an encrypted "other" answer', () => {
  it('rejects an answer another person already gave', async () => {
    const uniqueVariables: Record<string, Variable> = {
      ...variables,
      otherReason: {
        name: 'Other reason',
        type: 'text',
        component: 'Text',
        encrypted: true,
        validation: { unique: true },
      },
    };
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { otherReason: 'Neighbour' },
        uniqueVariables,
        'pw',
      );
    const neighbour: NcNode = {
      [entityPrimaryKeyProperty]: 'n2',
      type: 'person',
      [entityAttributesProperty]: encryptedAttributes,
      [entitySecureAttributesMeta]: secureAttributes,
    };
    decryption.ready = false;
    const { store, dropIntoOther } = renderCategoricalBin('pw', {
      others: [neighbour],
      stageVariables: uniqueVariables,
    });

    await waitFor(() => expect(decryption.ready).toBe(true));
    await dropIntoOther();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Neighbour' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .otherReason,
    ).toBeUndefined();
  });
});
