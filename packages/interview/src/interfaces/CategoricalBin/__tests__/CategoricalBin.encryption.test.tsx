import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
import { StageDynamicValues } from '../../../dynamicValues/DynamicValueScope';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { interviewToastManager } from '../../../toast/interviewToastManager';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import {
  getDecryptionScope,
  readEncryptedAttribute,
} from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
import { generateSecureAttributes } from '../../Anonymisation/utils';
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
  name: { name: 'name', label: 'name', type: 'text', component: 'Text' },
  category: {
    name: 'Category',
    label: 'Category',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [{ label: { en: 'Family' }, value: 1 }],
  },
  otherReason: {
    name: 'Other reason',
    label: 'Other reason',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const stage: StageProps<'CategoricalBin'>['stage'] = {
  id: STAGE_ID,
  type: 'CategoricalBin',
  label: { en: 'Categorise people' },
  subject: { entity: 'node', type: 'person' },
  prompts: [
    {
      id: PROMPT_ID,
      text: { en: 'Which category?' },
      variable: asEntityAttributeReference('category'),
      otherVariable: asEntityAttributeReference('otherReason'),
      otherVariablePrompt: { en: 'Please specify' },
      otherOptionLabel: { en: 'Other' },
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

async function renderCategoricalBin({
  unlocked = false,
  subject = person,
  others = [],
  stageVariables = variables,
  binStage = stage,
}: {
  unlocked?: boolean;
  subject?: NcNode;
  others?: NcNode[];
  stageVariables?: Record<string, Variable>;
  binStage?: StageProps<'CategoricalBin'>['stage'];
} = {}) {
  const store = createEncryptionStore(
    [subject, ...others],
    [binStage],
    stageVariables,
  );
  if (unlocked) await unlockWith(store, 'pw');

  let dndStore: StoreApi<DndStore> | undefined;
  render(
    <InterviewI18nProvider requestedLocale="en">
      <Provider store={store}>
        <TestProtocolLocalization>
          <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
            <DialogProvider>
              <DndStoreProvider>
                <CaptureDndStore
                  onStore={(captured) => {
                    dndStore = captured;
                  }}
                />
                <StageDynamicValues stage={binStage}>
                  <CategoricalBin
                    stage={binStage}
                    getNavigationHelpers={() => ({
                      moveForward: () => {},
                      moveBackward: () => {},
                    })}
                  />
                </StageDynamicValues>
              </DndStoreProvider>
            </DialogProvider>
          </CurrentStepProvider>
        </TestProtocolLocalization>
      </Provider>
    </InterviewI18nProvider>,
  );

  const dropIntoOther = async (beforeDrop?: () => void) => {
    const target = getCatBinDropTargetId(STAGE_ID, PROMPT_ID, OTHER_BIN_INDEX);
    act(() => {
      dndStore?.getState().startDrag(
        {
          id: subject[entityPrimaryKeyProperty],
          type: 'NODE',
          metadata: subject,
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
      beforeDrop?.();
      dndStore?.getState().setActiveDropTarget(target);
      dndStore?.getState().endDrag();
    });
  };

  return { store, dropIntoOther };
}

describe('CategoricalBin asking for an encrypted "other" answer', () => {
  it('asks for the passphrase instead of taking an answer it could not save', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, dropIntoOther } = await renderCategoricalBin();
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
    const { store, dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
    });

    await dropIntoOther();
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Cousin' },
    });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    const stored = await waitFor(() => {
      const [saved] = store.getState().session.network.nodes;
      const attribute = saved
        ? readEncryptedAttribute(saved, 'otherReason', variables)
        : undefined;
      if (attribute?.status !== 'encrypted') {
        throw new Error('Expected the answer to be stored encrypted');
      }
      return attribute.value;
    });
    expect(stored.nodeId).toBe(person[entityPrimaryKeyProperty]);
    const { key } = await encryptionFor('pw');
    await expect(decryptValue(key, stored, stored)).resolves.toBe('Cousin');
  });

  it('shows the decrypted answer when it is asked again', async () => {
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { otherReason: 'Cousin' },
        variables,
        (await encryptionFor('pw')).key,
        person[entityPrimaryKeyProperty],
      );
    const { dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
      subject: {
        ...person,
        [entityAttributesProperty]: {
          ...person[entityAttributesProperty],
          ...encryptedAttributes,
        },
        [entitySecureAttributesMeta]: secureAttributes,
      },
    });

    await dropIntoOther();

    expect(await screen.findByRole('textbox')).toHaveValue('Cousin');
  });

  it('shows a plaintext answer stored under the encrypted variable', async () => {
    // External data can hold the answer in the clear.
    const { dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
      subject: {
        ...person,
        [entityAttributesProperty]: {
          ...person[entityAttributesProperty],
          otherReason: 'Cousin',
        },
      },
    });

    await dropIntoOther();

    expect(await screen.findByRole('textbox')).toHaveValue('Cousin');
  });

  it('keeps an answer it cannot read when nothing new is typed', async () => {
    // Ciphertext that lost its record can never be decrypted.
    const unreadable = [1, 2, 3];
    const { store, dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
      subject: {
        ...person,
        [entityAttributesProperty]: {
          ...person[entityAttributesProperty],
          category: [1],
          otherReason: unreadable,
        },
      },
    });

    await dropIntoOther();
    expect(await screen.findByRole('textbox')).toHaveValue('');
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() =>
      expect(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty]
          .category,
      ).toBeUndefined(),
    );
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .otherReason,
    ).toEqual(unreadable);
  });

  it('shows the person by their decrypted name while asking', async () => {
    const namedVariables: Record<string, Variable> = {
      ...variables,
      name: {
        name: 'name',
        label: 'name',
        type: 'text',
        component: 'Text',
        encrypted: true,
      },
    };
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { name: 'Alice' },
        namedVariables,
        (await encryptionFor('pw')).key,
        person[entityPrimaryKeyProperty],
      );
    const { dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
      subject: {
        ...person,
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      },
      stageVariables: namedVariables,
    });

    await dropIntoOther();

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Alice')).toBeVisible();
    expect(within(dialog).queryByText('Person')).toBeNull();
  });

  it('names the person in the question once their name has decrypted', async () => {
    const namedVariables: Record<string, Variable> = {
      ...variables,
      name: {
        name: 'name',
        label: 'name',
        type: 'text',
        component: 'Text',
        encrypted: true,
      },
    };
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { name: 'Alice' },
        namedVariables,
        (await encryptionFor('pw')).key,
        person[entityPrimaryKeyProperty],
      );
    const [prompt] = stage.prompts;
    const { store, dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
      subject: {
        ...person,
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      },
      stageVariables: namedVariables,
      binStage: {
        ...stage,
        dynamicValues: { who: { path: 'node.$label' } },
        prompts: [{ ...prompt!, otherVariablePrompt: { en: 'Why {who}?' } }],
      },
    });
    // The name has not decrypted yet when the person is dropped, such as
    // just after the passphrase is entered.
    await dropIntoOther(() =>
      getDecryptionScope(store.getState)?.outcomes.clear(),
    );

    const dialog = await screen.findByRole('dialog');
    const value = await within(dialog).findByText('Alice', { selector: 'bdi' });
    expect(value.closest('label')).toHaveTextContent(/^Why Alice/);
  });
});

describe('CategoricalBin validating an encrypted "other" answer', () => {
  it('rejects an answer another person already gave', async () => {
    const uniqueVariables: Record<string, Variable> = {
      ...variables,
      otherReason: {
        name: 'Other reason',
        label: 'Other reason',
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
        (await encryptionFor('pw')).key,
        'n2',
      );
    const neighbour: NcNode = {
      [entityPrimaryKeyProperty]: 'n2',
      type: 'person',
      [entityAttributesProperty]: encryptedAttributes,
      [entitySecureAttributesMeta]: secureAttributes,
    };
    decryption.ready = false;
    const { store, dropIntoOther } = await renderCategoricalBin({
      unlocked: true,
      others: [neighbour],
      stageVariables: uniqueVariables,
    });

    // The question reads the stored answers when it is asked.
    await dropIntoOther();
    await waitFor(() => expect(decryption.ready).toBe(true));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Neighbour' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .otherReason,
    ).toBeUndefined();
  });

  it('takes the passphrase inside the dialog when the answer is checked against a protected one', async () => {
    // The answer is not encrypted, but must differ from the person's name,
    // which is.
    const comparedVariables: Record<string, Variable> = {
      ...variables,
      name: {
        name: 'name',
        label: 'name',
        type: 'text',
        component: 'Text',
        encrypted: true,
      },
      otherReason: {
        name: 'Other reason',
        label: 'Other reason',
        type: 'text',
        component: 'Text',
        validation: { differentFrom: asEntityAttributeReference('name') },
      },
    };
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { name: 'Alice' },
        comparedVariables,
        (await encryptionFor('pw')).key,
        person[entityPrimaryKeyProperty],
      );
    const { store, dropIntoOther } = await renderCategoricalBin({
      subject: {
        ...person,
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      },
      stageVariables: comparedVariables,
    });

    await dropIntoOther();
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox');
    const submit = within(dialog).getByTestId('dialog-submit');
    fireEvent.change(input, { target: { value: 'Alice' } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(input).toHaveAccessibleDescription(
        /Your answers have not been saved/,
      ),
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Passphrase' }));
    const prompt = await screen.findByRole('dialog', {
      name: 'Passphrase',
    });
    fireEvent.change(
      within(prompt).getByLabelText(/^Passphrase/, { selector: 'input' }),
      { target: { value: 'pw' } },
    );
    fireEvent.click(within(prompt).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(prompt).not.toBeInTheDocument());
    expect(
      within(dialog).queryByRole('button', { name: 'Passphrase' }),
    ).toBeNull();

    // Now compared with the name as the participant gave it.
    fireEvent.click(submit);
    await waitFor(() =>
      expect(input).toHaveAccessibleDescription(
        /Your answer must be different/,
      ),
    );

    fireEvent.change(input, { target: { value: 'Cousin' } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty]
          .otherReason,
      ).toBe('Cousin'),
    );
  });
});
