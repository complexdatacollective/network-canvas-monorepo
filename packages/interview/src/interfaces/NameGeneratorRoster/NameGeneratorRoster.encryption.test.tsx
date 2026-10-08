import { act, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import type { DropCallback } from '@codaco/fresco-ui/dnd/types';
import type { Variable } from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { interviewToastManager } from '../../toast/interviewToastManager';
import type { StageProps } from '../../types';
import { TestProtocolLocalization } from '../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  NODE_TYPE,
  outOfBoundsHeader,
  unlockWith,
} from '../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../Anonymisation/decryptionScope';
import { decryptValue } from '../Anonymisation/encryptionFormat';
import NameGeneratorRoster from './NameGeneratorRoster';
import type { UseItemElement } from './useItems';

const aliceRow = {
  _uid: 'roster-alice',
  type: 'person',
  attributes: { name: 'Alice', age: 40 },
};

const external = vi.hoisted(() => ({
  rosterPeople: [] as {
    _uid: string;
    type: string;
    attributes: Record<string, string | number>;
  }[],
}));

vi.mock('../../hooks/useExternalData', () => ({
  default: () => ({
    externalData: external.rosterPeople,
    status: { state: 'ready' },
  }),
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

beforeEach(() => {
  external.rosterPeople = [aliceRow];
});

afterEach(() => {
  vi.restoreAllMocks();
});

const stage: StageProps<'NameGeneratorRoster'>['stage'] = {
  id: 'roster-stage',
  type: 'NameGeneratorRoster',
  label: { en: 'Roster' },
  subject: { entity: 'node', type: NODE_TYPE },
  dataSource: 'roster-data',
  prompts: [{ id: 'prompt-1', text: { en: 'Who do you know?' } }],
};

const PASSPHRASE = 'roster passphrase';

/**
 * Renders the roster in an interview where no passphrase has been chosen yet,
 * or (`resumed`) one chosen earlier whose key is in force unless `locked`, or
 * (`refused`) one whose header no passphrase can open.
 */
async function renderRoster(
  interview: 'fresh' | 'refused' | { resumed: true; locked: boolean },
  variables?: Record<string, Variable>,
) {
  const { header } = await encryptionFor(PASSPHRASE);
  const store = createEncryptionStore([], [stage], variables, {
    header:
      interview === 'fresh'
        ? undefined
        : interview === 'refused'
          ? outOfBoundsHeader(header)
          : header,
  });
  if (typeof interview === 'object' && !interview.locked) {
    await unlockWith(store, PASSPHRASE);
  }

  render(
    <InterviewI18nProvider requestedLocale="en">
      <Provider store={store}>
        <TestProtocolLocalization>
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
        </TestProtocolLocalization>
      </Provider>
    </InterviewI18nProvider>,
  );

  const draggable = () => {
    const disabled = new Set(roster.disabledKeys);
    return roster.items.filter((item) => !disabled.has(item.id));
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

  return { store, draggable, dropAlice };
}

describe('NameGeneratorRoster adding people whose answers are encrypted', () => {
  it('says why no one can be added when no passphrase can open the interview', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, draggable } = await renderRoster('refused');

    expect(draggable()).toEqual([]);
    await waitFor(() => expect(toast).toHaveBeenCalled());
    render(
      <InterviewI18nProvider requestedLocale="en">
        {toast.mock.calls.map(([options], index) => (
          <p key={index}>{options.description}</p>
        ))}
      </InterviewI18nProvider>,
    );
    expect(
      screen.getByText(/cannot be shown or saved in this interview/),
    ).toBeInTheDocument();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('lets no one be dragged in, and asks for the passphrase, before one is entered', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, draggable, dropAlice } = await renderRoster('fresh');

    expect(roster.items).toHaveLength(1);
    expect(draggable()).toEqual([]);
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await dropAlice();

    expect(store.getState().session.network.nodes).toEqual([]);
    expect(toast).not.toHaveBeenCalled();
  });

  // A roster's columns are keyed by variable id once read, and an id is rarely
  // the variable's name.
  it('holds back a row whose encrypted column is keyed by a variable id unlike its name', async () => {
    external.rosterPeople = [
      { ...aliceRow, attributes: { 'var-name': 'Alice', 'var-age': 40 } },
    ];
    const { store, draggable } = await renderRoster('fresh', {
      'var-name': {
        name: 'name',
        label: 'name',
        type: 'text',
        component: 'Text',
        encrypted: true,
      },
      'var-age': {
        name: 'age',
        label: 'age',
        type: 'number',
        component: 'Number',
      },
    });

    expect(roster.items).toHaveLength(1);
    expect(draggable()).toEqual([]);
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('takes no one in a resumed interview, asking for the passphrase rather than trying to save, until it is entered again', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, draggable, dropAlice } = await renderRoster({
      resumed: true,
      locked: true,
    });

    expect(draggable()).toEqual([]);
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await dropAlice();

    expect(store.getState().session.network.nodes).toEqual([]);
    // A write the session refused would be reported with a toast; the roster
    // should not have attempted one.
    expect(toast).not.toHaveBeenCalled();

    await act(() => unlockWith(store, PASSPHRASE));

    expect(draggable()).toHaveLength(1);
  });

  it('adds a dropped person under their roster id, with their name encrypted for that id', async () => {
    const { store, draggable, dropAlice } = await renderRoster({
      resumed: true,
      locked: false,
    });

    expect(draggable()).toHaveLength(1);

    await dropAlice();

    await waitFor(() =>
      expect(store.getState().session.network.nodes).toHaveLength(1),
    );
    const [added] = store.getState().session.network.nodes;
    if (!added) throw new Error('Expected Alice to be added');
    expect(added[entityPrimaryKeyProperty]).toBe('roster-alice');
    const stored = readEncryptedAttribute(added, 'name', encryptedVariables);
    if (stored?.status !== 'encrypted') {
      throw new Error('Expected a stored ciphertext');
    }
    expect(stored.value.nodeId).toBe('roster-alice');
    expect(Object.keys(added[entitySecureAttributesMeta]?.name ?? {})).toEqual([
      'iv',
    ]);
    const { key } = await encryptionFor(PASSPHRASE);
    await expect(decryptValue(key, stored.value, stored.value)).resolves.toBe(
      'Alice',
    );
  });
});
