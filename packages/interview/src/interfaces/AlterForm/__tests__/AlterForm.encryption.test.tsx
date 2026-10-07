import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
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
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  alterFormStages,
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  outOfBoundsHeader,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
import AlterForm from '../AlterForm';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  // Reported after mount, as a real observer would, so motion's viewport
  // handlers are not run before the element they animate exists.
  observe(target: Element) {
    const bounds = target.getBoundingClientRect();
    queueMicrotask(() =>
      this.callback(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: bounds,
            intersectionRect: bounds,
            rootBounds: null,
            time: 0,
          },
        ],
        this,
      ),
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
});

type Stages = Parameters<typeof createEncryptionStore>[1];

async function renderAlterForm({
  person,
  unlocked = false,
  refused = false,
  stages = alterFormStages,
  variables = encryptedVariables,
}: {
  person?: NcNode;
  unlocked?: boolean;
  /** Stores a header no passphrase can open, as a damaged copy might. */
  refused?: boolean;
  stages?: Stages;
  variables?: Record<string, Variable>;
} = {}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(
    [person ?? (await makeEncryptedPerson('n1', 'Alice', 'pw'))],
    stages,
    variables,
    { header: refused ? outOfBoundsHeader(header) : header },
  );
  const alterFormStage = stages?.[0];
  if (unlocked) await unlockWith(store, 'pw');

  // Every time the passphrase is asked for, not only the latest state.
  let prompts = 0;
  store.subscribe(() => {
    if (store.getState().ui.showPassphrasePrompter) prompts += 1;
  });

  const onStepChange = vi.fn();
  let moveForward: (() => Promise<void>) | undefined;
  let moveBackward: (() => Promise<void>) | undefined;

  function Harness() {
    const navigation = useInterviewNavigation(0);
    moveForward = navigation.moveForward;
    moveBackward = navigation.moveBackward;
    if (alterFormStage?.type !== 'AlterForm') return null;

    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        <AlterForm
          stage={alterFormStage}
          getNavigationHelpers={() => ({
            moveForward: () => void navigation.moveForward(),
            moveBackward: () => void navigation.moveBackward(),
          })}
        />
      </StageMetadataProvider>
    );
  }

  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <InterviewI18nProvider requestedLocale="en">
          <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
            <DialogProvider>
              <Harness />
            </DialogProvider>
          </CurrentStepProvider>
        </InterviewI18nProvider>
      </TestProtocolLocalization>
    </Provider>,
  );

  const next = () =>
    act(async () => {
      await moveForward?.();
    });

  // Leave the introduction for the first person's questions.
  await next();

  const back = () =>
    act(async () => {
      await moveBackward?.();
    });

  return { store, onStepChange, next, back, prompts: () => prompts };
}

/** A ciphertext written for another person fails to decrypt for this one. */
async function unreadablePerson(): Promise<NcNode> {
  const elsewhere = await makeEncryptedPerson('elsewhere', 'Alice', 'pw');
  return { ...elsewhere, [entityPrimaryKeyProperty]: 'n1' };
}

async function storedName(store: ReturnType<typeof createEncryptionStore>) {
  const [saved] = store.getState().session.network.nodes;
  const stored = saved
    ? readEncryptedAttribute(saved, 'name', encryptedVariables)
    : undefined;
  if (stored?.status !== 'encrypted') {
    throw new Error('Expected the name to be stored encrypted');
  }
  expect(stored.value.nodeId).toBe(saved?.[entityPrimaryKeyProperty]);
  const { key } = await encryptionFor('pw');
  return decryptValue(key, stored.value, stored.value);
}

describe('AlterForm with an encrypted question', () => {
  it('asks for the passphrase instead of taking answers it could not save', async () => {
    const { store, onStepChange, next } = await renderAlterForm();
    const before = store.getState().session.network;

    expect(
      await screen.findByText(
        /Some answers here are protected by your passphrase/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Age' })).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await next();

    expect(onStepChange).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);
  });

  it('shows decrypted answers and saves encrypted and plain answers together once the passphrase is in force', async () => {
    const { store, onStepChange, next } = await renderAlterForm({
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    await user.clear(age);
    await user.type(age, '41');

    await user.clear(name);
    await user.type(name, 'Alicia');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    await expect(storedName(store)).resolves.toBe('Alicia');
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty].age,
    ).toBe(41);
  });

  it('shows an answer the key cannot read as unavailable and keeps it through a save, without asking for the passphrase again', async () => {
    const person = await unreadablePerson();
    const { store, onStepChange, next, prompts } = await renderAlterForm({
      person,
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Answer unavailable');
    expect(name).toHaveAttribute('readonly');
    expect(name).toHaveAccessibleDescription(/cannot be shown here/);

    const age = screen.getByRole('spinbutton', { name: 'Age' });
    expect(age).toHaveValue(40);
    await user.clear(age);
    await user.type(age, '41');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).toEqual({
      ...person[entityAttributesProperty],
      age: 41,
    });
    expect(saved?.[entitySecureAttributesMeta]).toEqual(
      person[entitySecureAttributesMeta],
    );
    expect(prompts()).toBe(0);
  });

  it('shows each protected question as unavailable and saves the rest, without asking for a passphrase, when none can open the interview', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store, onStepChange, next, prompts } = await renderAlterForm({
      person,
      refused: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Answer unavailable');
    expect(name).toHaveAttribute('readonly');
    expect(name).toHaveAccessibleDescription(
      /cannot be shown or saved in this interview/,
    );
    expect(
      screen.queryByRole('button', { name: 'Enter a new answer' }),
    ).toBeNull();
    expect(screen.queryByText(/Enter your passphrase/)).toBeNull();

    const age = screen.getByRole('spinbutton', { name: 'Age' });
    await user.clear(age);
    await user.type(age, '41');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).toEqual({
      ...person[entityAttributesProperty],
      age: 41,
    });
    expect(saved?.[entitySecureAttributesMeta]).toEqual(
      person[entitySecureAttributesMeta],
    );
    expect(prompts()).toBe(0);
  });

  it('replaces an unavailable answer once a new one is entered', async () => {
    const { store, onStepChange, next } = await renderAlterForm({
      person: await unreadablePerson(),
      unlocked: true,
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Enter a new answer' }),
    );
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(name).toHaveFocus();
    await user.type(name, 'Alicia');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    await expect(storedName(store)).resolves.toBe('Alicia');
  });

  it('keeps an unavailable answer when its new answer is left empty', async () => {
    const person = await unreadablePerson();
    const { store, onStepChange, next } = await renderAlterForm({
      person,
      unlocked: true,
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Enter a new answer' }),
    );
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).toEqual(
      person[entityAttributesProperty],
    );
    expect(saved?.[entitySecureAttributesMeta]).toEqual(
      person[entitySecureAttributesMeta],
    );
  });
});

describe('AlterForm going back from the first person', () => {
  it('saves the answers entered before showing the introduction again', async () => {
    const { store, back } = await renderAlterForm({ unlocked: true });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveValue('Alice'));
    await user.clear(name);
    await user.type(name, 'Alicia');
    await back();

    expect(await screen.findByText('About each person')).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).toBeNull();
    await expect(storedName(store)).resolves.toBe('Alicia');
  });
});

describe('AlterForm comparing an answer with a protected one', () => {
  const variables: Record<string, Variable> = {
    ...encryptedVariables,
    nickname: {
      name: 'nickname',
      label: 'Nickname',
      type: 'text',
      component: 'Text',
      validation: { differentFrom: asEntityAttributeReference('name') },
    },
  };
  const stages: Stages = [
    {
      id: 'alter-form',
      type: 'AlterForm',
      label: { en: 'Alter form' },
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: { en: 'About each person' },
        text: { en: 'Intro' },
      },
      form: {
        fields: [
          {
            variable: asEntityAttributeReference('nickname'),
            prompt: { en: 'Nickname' },
          },
        ],
      },
    },
    ...alterFormStages.slice(1),
  ];

  it('checks the answer as if the protected one were unanswered when no passphrase can open the interview', async () => {
    const { store, onStepChange, next, prompts } = await renderAlterForm({
      stages,
      variables,
      refused: true,
    });
    const user = userEvent.setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Nickname' }),
      'Alice',
    );
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    expect(screen.queryByText(/Enter your passphrase/)).toBeNull();
    expect(prompts()).toBe(0);
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .nickname,
    ).toBe('Alice');
  });

  it('asks for the passphrase before checking the answer, then checks it against the protected one', async () => {
    const { store, onStepChange, next } = await renderAlterForm({
      stages,
      variables,
    });
    const user = userEvent.setup();

    const nickname = await screen.findByRole('textbox', { name: 'Nickname' });
    await user.type(nickname, 'Alice');
    await next();

    expect(
      await screen.findByText(
        'This answer is checked against answers protected by your passphrase. Enter your passphrase, then try again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('An error occurred while validating.'),
    ).toBeNull();
    expect(onStepChange).not.toHaveBeenCalled();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await act(() => unlockWith(store, 'pw'));
    await next();

    expect(
      await screen.findByText(/must be different from your earlier answer/i),
    ).toBeInTheDocument();
    expect(onStepChange).not.toHaveBeenCalled();

    await user.clear(nickname);
    await user.type(nickname, 'Ali');
    await next();

    await waitFor(() => expect(onStepChange).toHaveBeenCalled());
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .nickname,
    ).toBe('Ali');
  });
});
