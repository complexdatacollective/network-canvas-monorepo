import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';
import { FakeAudioContext, settle } from '../sounds/__tests__/fakeAudioContext';
import { INTERACTION_SOUND_SPRITE } from '../sounds/interactionSoundSprite';
import { deleteEdge, deleteNode } from '../store/modules/session';
import { testId, testTypeId } from './testIds';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../interfaces', () => {
  const ObservedInterface = ({ stage }: { stage: { id: string } }) => (
    <div data-stage-interface={stage.id} />
  );
  return { default: () => ObservedInterface };
});

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');

const payload = {
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localeOptions: [getLocaleMetadata('en')],
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego-1',
        [entityAttributesProperty]: {},
      },
      nodes: [
        {
          [entityPrimaryKeyProperty]: 'a',
          type: PERSON,
          [entityAttributesProperty]: {},
        },
        {
          [entityPrimaryKeyProperty]: 'b',
          type: PERSON,
          [entityAttributesProperty]: {},
        },
      ],
      edges: [
        {
          [entityPrimaryKeyProperty]: 'e',
          type: KNOWS,
          from: 'a',
          to: 'b',
          [entityAttributesProperty]: {},
        },
      ],
    },
  },
  protocol: {
    id: 'protocol-1',
    hash: 'protocol-hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Interaction sounds protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      ego: { variables: {} },
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {},
        },
      },
      edge: { [KNOWS]: { name: 'Knows', color: 'edge-color-seq-1' } },
    },
    assets: [],
    stages: [
      {
        id: testId('only-stage'),
        type: 'Information',
        label: { en: 'Only stage' },
        content: { en: '# Only stage' },
      },
    ],
  },
} satisfies InterviewPayload;

const contexts: FakeAudioContext[] = [];
const fetchSprite = vi.fn(() =>
  Promise.resolve(new Response(new ArrayBuffer(8))),
);

function ShellWithSounds({ on }: { on?: boolean }) {
  return (
    <Shell
      payload={payload}
      onSync={() => Promise.resolve()}
      requestedLocales={[]}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      hideNavigation
      flags={{ isE2E: true }}
      interactionSounds={on}
    />
  );
}

function liveStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('store not exposed');
  return store;
}

beforeEach(() => {
  contexts.length = 0;
  fetchSprite.mockClear();
  vi.stubGlobal('fetch', fetchSprite);
  vi.stubGlobal(
    'AudioContext',
    class extends FakeAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Shell interaction sounds', () => {
  it('creates no audio context and fetches nothing while the prop is off', async () => {
    render(<ShellWithSounds />);
    await act(settle);
    act(() => {
      liveStore().dispatch(deleteNode('a'));
    });
    await act(settle);
    expect(contexts).toHaveLength(0);
    expect(fetchSprite).not.toHaveBeenCalled();
  });

  it('fetches the sprite once, by its plain emitted URL, when the prop is turned on', async () => {
    const view = render(<ShellWithSounds on={false} />);
    await act(settle);
    const storeBefore = liveStore();

    view.rerender(<ShellWithSounds on />);
    await act(settle);
    view.rerender(<ShellWithSounds on={false} />);
    view.rerender(<ShellWithSounds on />);
    await act(settle);

    // Exactly the URL the bundler emitted, with no request options, so a
    // service worker that precached it answers while offline.
    expect(fetchSprite.mock.calls).toEqual([
      [expect.stringMatching(/\/interaction-sounds\.wav$/)],
    ]);
    expect(contexts).toHaveLength(1);
    // Turning sounds on and off never recreates the interview's store.
    expect(liveStore()).toBe(storeBefore);
  });

  it('plays a network change through the store while on, and not once turned off', async () => {
    const view = render(<ShellWithSounds on />);
    await act(settle);
    const [context] = contexts;
    if (!context) throw new Error('No audio context');
    context.state = 'running';

    act(() => {
      liveStore().dispatch(deleteEdge('e'));
    });
    await act(settle);
    expect(context.played.map((source) => source.started?.[1])).toEqual([
      INTERACTION_SOUND_SPRITE['toggle-off'].start,
    ]);

    // A different, more important sound, which neither the repeat interval
    // nor the burst window would hold back.
    view.rerender(<ShellWithSounds on={false} />);
    context.state = 'running';
    act(() => {
      liveStore().dispatch(deleteNode('a'));
    });
    await act(settle);
    expect(context.played).toHaveLength(1);
  });

  it('closes its audio context when it unmounts', async () => {
    const view = render(<ShellWithSounds on />);
    await act(settle);
    view.unmount();
    expect(contexts[0]?.close).toHaveBeenCalled();
  });
});
