import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Codebook,
  type SortRule,
} from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { getPromptIndex } from '../../../selectors/session';
import { updatePrompt } from '../../../store/modules/session';
import type {
  BeforeNextFunction,
  RegisterBeforeNext,
  StageProps,
} from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import OneToManyDyadCensus from '../OneToManyDyadCensus';

// The list of people to pair with the focal person, reduced to the ids it is
// handed, in order.
vi.mock('../../../components/NodeList', async () => {
  const { createElement } = await import('react');
  const { entityPrimaryKeyProperty } = await import('@codaco/shared-consts');
  return {
    default: ({ items = [] }: { items?: NcNode[] }) =>
      createElement(
        'ul',
        { 'data-testid': 'targets' },
        items.map((node) =>
          createElement(
            'li',
            { key: node[entityPrimaryKeyProperty] },
            node[entityPrimaryKeyProperty],
          ),
        ),
      ),
  };
});

// jsdom has neither observer; the stage uses them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

const EDGE_TYPE = 'friendship';

const edgeTypes: Codebook['edge'] = {
  [EDGE_TYPE]: {
    name: 'Friendship',
    label: { en: 'Friendship' },
    color: 'edge-color-seq-1',
    variables: {},
  },
};

const byName: SortRule[] = [
  { property: asEntityAttributeReference('name'), direction: 'asc' },
];

const prompt = (id: string) => ({
  id,
  text: { en: 'Who do they know?' },
  createEdge: EDGE_TYPE,
  bucketSortOrder: byName,
});

const stageWith = (
  removeAfterConsideration: boolean,
): StageProps<'OneToManyDyadCensus'>['stage'] => ({
  id: 'one-to-many',
  type: 'OneToManyDyadCensus',
  label: { en: 'One to many' },
  subject: { entity: 'node', type: NODE_TYPE },
  behaviours: { removeAfterConsideration },
  prompts: [prompt('first'), prompt('second')],
});

// Stored out of alphabetical order: while the interview is locked the name
// rule is left out and they keep this order; by name they are alice, bob,
// carol.
const people = async () => [
  await makeEncryptedPerson('carol', 'Carol', 'pw'),
  await makeEncryptedPerson('alice', 'Alice', 'pw'),
  await makeEncryptedPerson('bob', 'Bob', 'pw'),
];

async function renderCensus({
  removeAfterConsideration = false,
  unlocked = false,
}: { removeAfterConsideration?: boolean; unlocked?: boolean } = {}) {
  const stage = stageWith(removeAfterConsideration);
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(await people(), [stage], undefined, {
    header,
    edgeTypes,
  });
  if (unlocked) await unlockWith(store, 'pw');

  // Everyone the stage made the focal person, in turn.
  const focal: string[] = [];
  const tracker: Tracker = {
    track: (event, props) => {
      const id = props?.node_id;
      if (event === 'focal_node' && typeof id === 'string') focal.push(id);
    },
    captureException: () => undefined,
  };

  let beforeNext: BeforeNextFunction | null = null;
  const registerBeforeNext: RegisterBeforeNext = (
    keyOrFn: string | BeforeNextFunction | null,
    maybeFn?: BeforeNextFunction | null,
  ) => {
    beforeNext = typeof keyOrFn === 'string' ? (maybeFn ?? null) : keyOrFn;
  };

  const { container } = render(
    <AnalyticsContext.Provider value={tracker}>
      <Provider store={store}>
        <TestProtocolLocalization>
          <InterviewI18nProvider requestedLocale="en">
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <StageMetadataContext.Provider value={registerBeforeNext}>
                <OneToManyDyadCensus
                  stage={stage}
                  getNavigationHelpers={() => ({
                    moveForward: vi.fn(),
                    moveBackward: vi.fn(),
                  })}
                />
              </StageMetadataContext.Provider>
            </CurrentStepProvider>
          </InterviewI18nProvider>
        </TestProtocolLocalization>
      </Provider>
    </AnalyticsContext.Provider>,
  );

  // The focal person is the one drawn above the list, with className z-10.
  const focalLabel = () =>
    container.querySelector('button.z-10')?.getAttribute('aria-label') ?? null;

  const targets = () =>
    [...container.querySelectorAll('[data-testid="targets"] li')].map(
      (item) => item.textContent,
    );

  // Drives the stage's beforeNext handler; when it lets navigation through,
  // changes the prompt as the interview's navigation would.
  const navigate = async (direction: 'forwards' | 'backwards') => {
    let allowed = false;
    await act(async () => {
      allowed = (await beforeNext?.(direction, 'step')) === true;
    });
    if (allowed) {
      const current = getPromptIndex(store.getState());
      await act(async () => {
        store.dispatch(
          updatePrompt(direction === 'forwards' ? current + 1 : current - 1),
        );
      });
    }
    return allowed;
  };

  const unlock = () => act(() => unlockWith(store, 'pw'));

  return { focal, focalLabel, targets, navigate, unlock };
}

// Lets any decryption the stage started settle, so a focal person who would
// only appear late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('OneToManyDyadCensus when the passphrase is entered part-way', () => {
  it('steps through everyone once, in the order the prompt began with', async () => {
    const { focal, focalLabel, navigate, unlock } = await renderCensus();
    await settle();
    expect(focal).toEqual(['carol']);

    expect(await navigate('forwards')).toBe(false);
    await settle();
    expect(focal).toEqual(['carol', 'alice']);

    await unlock();
    await settle();
    // Still Alice, now shown by her name, although by name she comes first.
    await waitFor(() => expect(focalLabel()).toBe('Alice'));
    expect(focal).toEqual(['carol', 'alice']);

    expect(await navigate('forwards')).toBe(false);
    await waitFor(() => expect(focalLabel()).toBe('Bob'));

    // Bob was the last person this prompt had not shown.
    expect(await navigate('forwards')).toBe(true);
    await settle();
    expect(focal.slice(0, 3)).toEqual(['carol', 'alice', 'bob']);

    // The next prompt begins in the order the names now give.
    await waitFor(() => expect(focalLabel()).toBe('Alice'));
    expect(focal).toEqual(['carol', 'alice', 'bob', 'alice']);
  });

  it('hides only the people already considered when removeAfterConsideration is set', async () => {
    const { focal, focalLabel, targets, navigate, unlock } = await renderCensus(
      { removeAfterConsideration: true },
    );
    await waitFor(() => expect(targets()).toEqual(['alice', 'bob']));

    expect(await navigate('forwards')).toBe(false);
    await waitFor(() => expect(targets()).toEqual(['bob']));

    await unlock();
    await settle();
    await waitFor(() => expect(focalLabel()).toBe('Alice'));
    expect(targets()).toEqual(['bob']);
    expect(focal).toEqual(['carol', 'alice']);

    // Bob has been considered with everyone, so he is never the focal person.
    expect(await navigate('forwards')).toBe(true);
  });

  it('shows no one in the order the locked answers give when the key is already in force', async () => {
    const { focal, focalLabel } = await renderCensus({ unlocked: true });

    await waitFor(() => expect(focalLabel()).toBe('Alice'));
    await settle();
    expect(focal).toEqual(['alice']);
  });

  it('resumes on the last focal person when going back to a prompt with removeAfterConsideration', async () => {
    const { focalLabel, navigate } = await renderCensus({
      removeAfterConsideration: true,
      unlocked: true,
    });
    await waitFor(() => expect(focalLabel()).toBe('Alice'));

    expect(await navigate('forwards')).toBe(false);
    expect(await navigate('forwards')).toBe(true);
    await waitFor(() => expect(focalLabel()).toBe('Alice'));

    expect(await navigate('backwards')).toBe(true);
    // Bob, not Carol: Carol was never focal on the way forward.
    await waitFor(() => expect(focalLabel()).toBe('Bob'));
  });
});
