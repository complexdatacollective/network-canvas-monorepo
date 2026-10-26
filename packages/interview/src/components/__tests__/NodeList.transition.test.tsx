import { act, render, waitFor } from '@testing-library/react';
import { motion } from 'motion/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  NODE_TYPE,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import NodeList from '../NodeList';

// The list's exit animation (people shrinking out) waits until the test lets
// it finish; every other animation runs as it normally would here.
const exits = vi.hoisted(() => ({ pending: [] as (() => void)[] }));
vi.mock('@codaco/fresco-ui/hooks/useSafeAnimate', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@codaco/fresco-ui/hooks/useSafeAnimate')
    >();
  return {
    ...actual,
    useSafeAnimate: () => {
      const [scope, animate] = actual.useSafeAnimate();
      const held = (...args: Parameters<typeof animate>) => {
        const [, keyframes] = args;
        const isExit =
          typeof keyframes === 'object' &&
          keyframes !== null &&
          !Array.isArray(keyframes) &&
          'scale' in keyframes &&
          keyframes.scale === 0.6;
        if (!isExit) return animate(...args);
        return new Promise<void>((resolve) => exits.pending.push(resolve));
      };
      return [scope, held as typeof animate] as const;
    },
  };
});

const finishExits = () =>
  act(async () => {
    for (const finish of exits.pending.splice(0)) finish();
    await Promise.resolve();
  });

// jsdom has neither observer; the list uses them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

const person = (id: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: NODE_TYPE,
  [entityAttributesProperty]: {},
});

const alice = person('alice');
const bob = person('bob');
const carol = person('carol');

const store = createEncryptionStore([alice, bob, carol]);

const list = (
  items: NcNode[] | undefined,
  animationKey?: string,
  announcedName = 'People',
) => (
  <Provider store={store}>
    <TestProtocolLocalization>
      <InterviewI18nProvider requestedLocale="en">
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          <DndStoreProvider>
            <motion.div initial="initial" animate="animate">
              <NodeList
                id="people"
                items={items}
                animationKey={animationKey}
                announcedName={announcedName}
              />
            </motion.div>
          </DndStoreProvider>
        </CurrentStepProvider>
      </InterviewI18nProvider>
    </TestProtocolLocalization>
  </Provider>
);

// The people the list shows, by id.
const shown = () =>
  [...document.querySelectorAll('[id^="people-item-"]')].map((option) =>
    option.id.replace('people-item-', ''),
  );

describe('NodeList prompt transitions', () => {
  it('keeps showing the previous prompt’s people while they leave, then shows the new prompt’s', async () => {
    const view = render(list([alice, bob], 'prompt-1'));
    await waitFor(() => expect(shown()).toEqual(['alice', 'bob']));

    view.rerender(list([carol], 'prompt-2'));

    // The render that changes the prompt never shows the new people while
    // the old ones are still on their way out.
    expect(shown()).toEqual(['alice', 'bob']);
    // Still theirs until the exit ends.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(shown()).toEqual(['alice', 'bob']);

    await finishExits();
    await waitFor(() => expect(shown()).toEqual(['carol']));
  });

  it('shows new people at once when the prompt stays the same', async () => {
    const view = render(list([alice], 'prompt-1'));
    await waitFor(() => expect(shown()).toEqual(['alice']));

    view.rerender(list([alice, bob], 'prompt-1'));

    await waitFor(() => expect(shown()).toEqual(['alice', 'bob']));
  });

  it('shows the latest people once the exit ends, even if they changed during it', async () => {
    const view = render(list([alice], 'prompt-1'));
    await waitFor(() => expect(shown()).toEqual(['alice']));

    view.rerender(list([bob], 'prompt-2'));
    expect(shown()).toEqual(['alice']);
    view.rerender(list([bob, carol], 'prompt-2'));
    expect(shown()).toEqual(['alice']);

    await finishExits();
    await waitFor(() => expect(shown()).toEqual(['bob', 'carol']));
  });

  it('settles on an empty list when given no items and rendered again', async () => {
    const view = render(list(undefined));
    view.rerender(list(undefined, undefined, 'Everyone'));

    await waitFor(() => expect(shown()).toEqual([]));
  });
});
