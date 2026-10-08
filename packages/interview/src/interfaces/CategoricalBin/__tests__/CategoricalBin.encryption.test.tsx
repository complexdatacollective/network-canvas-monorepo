import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  makeEncryptedPerson,
} from '../../Anonymisation/__tests__/encryptionFixtures';
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

function renderCategoricalBin(
  passphrase?: string,
  {
    subject = person,
    others = [],
    stageVariables = variables,
    encryptionEnabled = true,
  }: {
    subject?: NcNode;
    others?: NcNode[];
    stageVariables?: Record<string, Variable>;
    encryptionEnabled?: boolean;
  } = {},
) {
  const store = createEncryptionStore(
    [subject, ...others],
    [stage],
    stageVariables,
    { encryptionEnabled },
  );
  if (passphrase) store.dispatch(setPassphrase(passphrase));

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
        </TestProtocolLocalization>
      </Provider>
    </InterviewI18nProvider>,
  );

  const dropIntoOther = async () => {
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
    if (!isNumberArray(data)) throw new Error('Expected a stored ciphertext');
    if (!secureAttributes)
      throw new Error('Expected secure-attribute metadata');
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

  it('takes the passphrase again from inside the dialog, then saves the kept answer', async () => {
    const { store, dropIntoOther } = renderCategoricalBin('pw');
    const user = userEvent.setup();

    await dropIntoOther();
    const answer = await screen.findByRole('textbox', {
      name: /Please specify/,
    });
    expect(
      screen.queryByRole('button', { name: 'Enter your Passphrase' }),
    ).toBeNull();
    await user.type(answer, 'Cousin');
    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    await user.click(screen.getByTestId('dialog-submit'));
    expect(
      await screen.findByText(/Your answers have not been saved/),
    ).toBeVisible();

    await user.click(
      within(screen.getByRole('dialog', { name: 'Specify other' })).getByRole(
        'button',
        { name: 'Enter your Passphrase' },
      ),
    );
    const prompt = await screen.findByRole('dialog', {
      name: 'Enter your Passphrase',
    });
    await user.type(
      within(prompt).getByLabelText(/^Passphrase/, { selector: 'input' }),
      'pw',
    );
    await user.click(
      within(prompt).getByRole('button', { name: 'Submit passphrase' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Enter your Passphrase' }),
      ).toBeNull(),
    );

    expect(screen.getByRole('textbox', { name: /Please specify/ })).toHaveValue(
      'Cousin',
    );
    await user.click(screen.getByTestId('dialog-submit'));

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
    if (!isNumberArray(data)) throw new Error('Expected a stored ciphertext');
    if (!secureAttributes)
      throw new Error('Expected secure-attribute metadata');
    await expect(decryptData({ secureAttributes, data }, 'pw')).resolves.toBe(
      'Cousin',
    );
  });
});

describe('CategoricalBin showing a person whose name is encrypted', () => {
  it('shows their decrypted name in the "other" dialog', async () => {
    const { dropIntoOther } = renderCategoricalBin('pw', {
      subject: await makeEncryptedPerson('n1', 'Alice', 'pw'),
      stageVariables: {
        ...variables,
        name: {
          name: 'name',
          label: 'name',
          type: 'text',
          component: 'Text',
          encrypted: true,
        },
      },
    });

    await dropIntoOther();

    const dialog = await screen.findByRole('dialog', { name: 'Specify other' });
    expect(await within(dialog).findByText('Alice')).toBeVisible();
    expect(within(dialog).queryByText('Person')).toBeNull();
  });
});

describe('CategoricalBin with the encrypted-variables experiment off', () => {
  it('takes and saves the "other" answer as plaintext without asking for a passphrase', async () => {
    const { store, dropIntoOther } = renderCategoricalBin(undefined, {
      encryptionEnabled: false,
    });

    await dropIntoOther();
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Cousin' },
    });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() =>
      expect(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty]
          .otherReason,
      ).toBe('Cousin'),
    );
    expect(
      store.getState().session.network.nodes[0]?.[entitySecureAttributesMeta],
    ).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});

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

describe('CategoricalBin validating an encrypted "other" answer', () => {
  it('rejects an answer another person already gave', async () => {
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

    await dropIntoOther();
    const input = await screen.findByRole('textbox');
    await waitFor(() => expect(decryption.ready).toBe(true));
    fireEvent.change(input, { target: { value: 'Neighbour' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .otherReason,
    ).toBeUndefined();
  });

  it("compares with the dropped person's own protected answer, whatever protects the others'", async () => {
    const differentFromVariables: Record<string, Variable> = {
      ...variables,
      nickname: {
        name: 'Nickname',
        label: 'Nickname',
        type: 'text',
        component: 'Text',
        encrypted: true,
      },
      otherReason: {
        name: 'Other reason',
        label: 'Other reason',
        type: 'text',
        component: 'Text',
        encrypted: true,
        validation: { differentFrom: asEntityAttributeReference('nickname') },
      },
    };
    const withNickname = async (
      id: string,
      name: string,
      nickname: string,
      passphrase: string,
    ): Promise<NcNode> => {
      const { encryptedAttributes, secureAttributes } =
        await generateSecureAttributes(
          { name, nickname },
          differentFromVariables,
          passphrase,
        );
      return {
        [entityPrimaryKeyProperty]: id,
        type: 'person',
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      };
    };
    const { store, dropIntoOther } = renderCategoricalBin('pw', {
      subject: await withNickname('n1', 'Alice', 'Ally', 'pw'),
      // Saved under another passphrase, and read by no rule of this answer.
      others: [await withNickname('n2', 'Bob', 'Bobby', 'an older passphrase')],
      stageVariables: differentFromVariables,
    });

    await dropIntoOther();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Ally' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.queryByText(/problem decrypting the data/)).toBeNull();
    expect(screen.queryByText(/Your answers have not been saved/)).toBeNull();
    expect(store.getState().ui.passphraseInvalid).toBe(false);
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .otherReason,
    ).toBeUndefined();
  });

  it('rejects a duplicate answer without a passphrase while the experiment is off', async () => {
    const neighbour: NcNode = {
      [entityPrimaryKeyProperty]: 'n2',
      type: 'person',
      [entityAttributesProperty]: { otherReason: 'Neighbour' },
    };
    const { store, dropIntoOther } = renderCategoricalBin(undefined, {
      others: [neighbour],
      stageVariables: uniqueVariables,
      encryptionEnabled: false,
    });

    await dropIntoOther();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Neighbour' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .otherReason,
    ).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});

describe('CategoricalBin comparing a plaintext "other" answer with a protected one', () => {
  it('takes the passphrase the check needs from inside the dialog, then saves the kept answer', async () => {
    // The answer is not protected, but must differ from the dropped person's
    // nickname, which is.
    const comparedVariables: Record<string, Variable> = {
      ...variables,
      nickname: {
        name: 'Nickname',
        label: 'Nickname',
        type: 'text',
        component: 'Text',
        encrypted: true,
      },
      otherReason: {
        name: 'Other reason',
        label: 'Other reason',
        type: 'text',
        component: 'Text',
        validation: { differentFrom: asEntityAttributeReference('nickname') },
      },
    };
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { name: 'Alice', nickname: 'Ally' },
        comparedVariables,
        'pw',
      );
    const { store, dropIntoOther } = renderCategoricalBin(undefined, {
      subject: {
        [entityPrimaryKeyProperty]: 'n1',
        type: 'person',
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      },
      stageVariables: comparedVariables,
    });
    const user = userEvent.setup();

    await dropIntoOther();
    await user.type(
      await screen.findByRole('textbox', { name: /Please specify/ }),
      'Cousin',
    );
    await user.click(screen.getByTestId('dialog-submit'));
    expect(
      await screen.findByText(/Your answers have not been saved/),
    ).toBeVisible();

    await user.click(
      within(screen.getByRole('dialog', { name: 'Specify other' })).getByRole(
        'button',
        { name: 'Enter your Passphrase' },
      ),
    );
    const prompt = await screen.findByRole('dialog', {
      name: 'Enter your Passphrase',
    });
    await user.type(
      within(prompt).getByLabelText(/^Passphrase/, { selector: 'input' }),
      'pw',
    );
    await user.click(
      within(prompt).getByRole('button', { name: 'Submit passphrase' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Enter your Passphrase' }),
      ).toBeNull(),
    );

    await user.click(screen.getByTestId('dialog-submit'));
    await waitFor(() =>
      expect(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty]
          .otherReason,
      ).toBe('Cousin'),
    );
  });
});
