import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import type { DropCallback } from '@codaco/fresco-ui/dnd/types';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import { setPassphrase, setPassphraseInvalid } from '../../store/modules/ui';
import { interviewToastManager } from '../../toast/interviewToastManager';
import type { StageProps } from '../../types';
import {
  createEncryptionStore,
  NODE_TYPE,
} from '../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../Anonymisation/decryptionScope';
import { decryptData } from '../Anonymisation/utils';
import NameGeneratorRoster from './NameGeneratorRoster';
import type { UseItemElement } from './useItems';

const { rosterPeople } = vi.hoisted(() => ({
  rosterPeople: [
    {
      _uid: 'roster-alice',
      type: 'person',
      attributes: { name: 'Alice', age: 40 },
    },
  ],
}));

vi.mock('../../hooks/useExternalData', () => ({
  default: () => ({ externalData: rosterPeople, status: { state: 'ready' } }),
}));

// The roster's virtualised cards do not lay out in jsdom, nor can a drag be
// performed there. What the roster hands its collection, and what it does with
// a drop onto the added list, is what is under test, so both are captured.
let roster: { items: UseItemElement[]; disabledKeys?: Iterable<unknown> } = {
  items: [],
};
vi.mock('@codaco/fresco-ui/collection/components/Collection', () => ({
  Collection: (props: {
    items: UseItemElement[];
    disabledKeys?: Iterable<unknown>;
  }) => {
    roster = props;
    return null;
  },
}));

let dropOnAddedList: DropCallback | undefined;
vi.mock('../../components/NodeList', () => ({
  default: (props: { onDrop?: DropCallback }) => {
    dropOnAddedList = props.onDrop;
    return null;
  },
}));

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const stage: StageProps<'NameGeneratorRoster'>['stage'] = {
  id: 'roster-stage',
  type: 'NameGeneratorRoster',
  label: 'Roster',
  subject: { entity: 'node', type: NODE_TYPE },
  dataSource: 'roster-data',
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
};

function renderRoster(passphrase?: string, encryptionEnabled = true) {
  const store = createEncryptionStore([], [stage], undefined, {
    encryptionEnabled,
  });
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  render(
    <InterviewI18nProvider requestedLocale="en">
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DndStoreProvider>
            <NameGeneratorRoster
              stage={stage}
              getNavigationHelpers={() => ({
                moveForward: () => {},
                moveBackward: () => {},
              })}
            />
          </DndStoreProvider>
        </CurrentStepProvider>
      </Provider>
    </InterviewI18nProvider>,
  );

  const draggable = () => {
    const disabled = new Set(roster.disabledKeys);
    return roster.items.filter((item) => !disabled.has(item.id));
  };

  // Starts adding Alice the way a drop onto the added list does, without
  // waiting for the add to finish.
  const startDroppingAlice = (alice: UseItemElement) => {
    act(() => {
      dropOnAddedList?.({ ...alice, itemType: 'SOURCE_NODES' });
    });
  };

  const dropAlice = async () => {
    const [alice] = roster.items;
    if (!alice) throw new Error('The roster lists Alice');
    expect(dropOnAddedList).toBeInstanceOf(Function);
    await act(async () => {
      dropOnAddedList?.({ ...alice, itemType: 'SOURCE_NODES' });
      await Promise.resolve();
    });
  };

  return { store, draggable, dropAlice, startDroppingAlice };
}

describe('NameGeneratorRoster adding people whose answers are encrypted', () => {
  it('lets no one be dragged in, and asks for the passphrase, before one is entered', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, draggable, dropAlice } = renderRoster();

    expect(roster.items).toHaveLength(1);
    expect(draggable()).toEqual([]);
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await dropAlice();

    expect(store.getState().session.network.nodes).toEqual([]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('stops taking people, and asks for the passphrase rather than trying to save, once the passphrase stops working', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, draggable, dropAlice } = renderRoster('pw');

    expect(draggable()).toHaveLength(1);

    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });

    expect(draggable()).toEqual([]);

    await dropAlice();

    expect(store.getState().session.network.nodes).toEqual([]);
    // A write the session refused would be reported with a toast; the roster
    // should not have attempted one.
    expect(toast).not.toHaveBeenCalled();
    expect(store.getState().ui.passphraseInvalid).toBe(true);
  });

  it('adds a dropped person with their answers encrypted while the passphrase works', async () => {
    const { store, draggable, dropAlice } = renderRoster('pw');

    expect(draggable()).toHaveLength(1);

    await dropAlice();

    await waitFor(() =>
      expect(store.getState().session.network.nodes).toHaveLength(1),
    );
    const [added] = store.getState().session.network.nodes;
    const data = added?.[entityAttributesProperty].name;
    const secureAttributes = added?.[entitySecureAttributesMeta]?.name;
    expect(isNumberArray(data)).toBe(true);
    expect(secureAttributes).toBeDefined();
    if (!isNumberArray(data)) throw new Error('Expected a stored ciphertext');
    if (!secureAttributes)
      throw new Error('Expected secure-attribute metadata');
    await expect(decryptData({ secureAttributes, data }, 'pw')).resolves.toBe(
      'Alice',
    );
  });
});

describe('NameGeneratorRoster with the encrypted-variables experiment off', () => {
  it('lets people be dragged in and adds them as plaintext without asking for a passphrase', async () => {
    const { store, draggable, dropAlice } = renderRoster(undefined, false);

    expect(draggable()).toHaveLength(1);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    await dropAlice();

    await waitFor(() =>
      expect(store.getState().session.network.nodes).toHaveLength(1),
    );
    const [added] = store.getState().session.network.nodes;
    expect(added?.[entityAttributesProperty].name).toBe('Alice');
    expect(added?.[entitySecureAttributesMeta]).toBeUndefined();
  });
});

describe('NameGeneratorRoster while a dropped person is being added', () => {
  it('takes them out of the roster as soon as they are dropped', () => {
    const { store, startDroppingAlice } = renderRoster('pw');
    const [alice] = roster.items;
    if (!alice) throw new Error('The roster lists Alice');

    startDroppingAlice(alice);

    expect(store.getState().session.network.nodes).toEqual([]);
    expect(roster.items).toEqual([]);
  });

  it('adds someone dropped again before their add finishes only once, holding nothing back', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, startDroppingAlice } = renderRoster('pw');
    const [alice] = roster.items;
    if (!alice) throw new Error('The roster lists Alice');

    startDroppingAlice(alice);
    // A drag that began before the card left the roster, ending on the list.
    startDroppingAlice(alice);

    // Leaving the stage waits for the adds under way, and stays if any was
    // refused.
    expect(await store.writesSettled()).toBe(true);
    expect(store.getState().session.network.nodes).toHaveLength(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it('puts them back in the roster, and says why, when they could not be added', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, startDroppingAlice } = renderRoster('pw');
    const [alice] = roster.items;
    if (!alice) throw new Error('The roster lists Alice');

    startDroppingAlice(alice);
    // Their answers were being protected with a passphrase no longer in force.
    act(() => {
      store.dispatch(setPassphrase('another passphrase'));
    });

    expect(await store.writesSettled()).toBe(false);
    await waitFor(() =>
      expect(roster.items.map((item) => item.id)).toEqual([alice.id]),
    );
    expect(store.getState().session.network.nodes).toEqual([]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: runtimeMessages.protectedAnswersNotSaved.defaultMessage,
      }),
    );
  });
});
