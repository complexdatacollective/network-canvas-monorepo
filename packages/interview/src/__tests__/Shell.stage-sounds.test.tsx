import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';
import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import type { CanvasNodeDragEnd } from '../canvas/useCanvasDrag';
import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';
import {
  FakeAudioContext,
  settle,
  soundBytes,
  soundOf,
} from '../sounds/__tests__/fakeAudioContext';
import {
  INTERACTION_SOUND_FILES,
  type InteractionSoundName,
} from '../sounds/interactionSoundFiles';
import { testId, testTypeId, testVariableId } from './testIds';

// The sounds the interview's own stages ask for, heard through the real
// Shell, store and sound engine, with only the audio output faked.

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

// The sociogram's canvas needs layout jsdom does not have. Its two ways of
// putting a node down are handed to the stage, which the test calls as the
// canvas would.
const canvas = vi.hoisted(() => ({
  onNodeDragEnd: undefined as CanvasNodeDragEnd | undefined,
  onDrop: undefined as
    | ((nodeId: string, position: { x: number; y: number }) => void)
    | undefined,
}));
vi.mock('../canvas/Canvas', () => ({
  default: (props: {
    onNodeDragEnd?: CanvasNodeDragEnd;
    onDrop?: (nodeId: string, position: { x: number; y: number }) => void;
  }) => {
    canvas.onNodeDragEnd = props.onNodeDragEnd;
    canvas.onDrop = props.onDrop;
    return <div data-testid="canvas" />;
  },
}));

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const NICKNAME = testVariableId('nickname');
const CLOSENESS = testVariableId('closeness');
const LAYOUT = testVariableId('layout');

const person = (id: string, name: string, attributes = {}) => ({
  [entityPrimaryKeyProperty]: id,
  type: PERSON,
  [entityAttributesProperty]: { [testVariableId('name')]: name, ...attributes },
});

const information = (name: string) => ({
  id: testId(name),
  type: 'Information' as const,
  label: { en: name },
  content: { en: `# ${name}` },
});

const egoForm = {
  id: testId('ego-form'),
  type: 'EgoForm',
  label: { en: 'About you' },
  introductionPanel: { title: { en: 'About you' } },
  form: {
    fields: [
      { id: 'f1', variable: NICKNAME, prompt: { en: 'Your nickname' } },
      { id: 'f2', variable: CLOSENESS, prompt: { en: 'How close' } },
    ],
  },
};

const oneToManyCensus = {
  id: testId('one-to-many'),
  type: 'OneToManyDyadCensus',
  label: { en: 'Who knows whom' },
  subject: { entity: 'node', type: PERSON },
  behaviours: { removeAfterConsideration: false },
  prompts: [
    {
      id: testId('otm-p1'),
      text: { en: 'Who do they know?' },
      createEdge: KNOWS,
    },
  ],
};

const dyadCensus = {
  id: testId('dyad'),
  type: 'DyadCensus',
  label: { en: 'Pairs' },
  subject: { entity: 'node', type: PERSON },
  prompts: [
    {
      id: testId('dyad-p1'),
      text: { en: 'Do they know each other?' },
      createEdge: KNOWS,
    },
  ],
};

const sociogram = {
  id: testId('sociogram'),
  type: 'Sociogram',
  label: { en: 'Place people' },
  subject: { entity: 'node', type: PERSON },
  background: { concentricCircles: 4 },
  prompts: [
    {
      id: testId('socio-p1'),
      text: { en: 'Place the people' },
      layout: { layoutVariable: LAYOUT },
      edges: { create: KNOWS, display: [KNOWS] },
    },
  ],
};

function payloadWith(
  stages: unknown[],
  nodes = [person('a', 'Alex'), person('b', 'Blake'), person('c', 'Casey')],
): InterviewPayload {
  return {
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
        nodes,
        edges: [],
      },
    },
    protocol: {
      id: 'protocol-1',
      hash: 'protocol-hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Stage sounds protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        ego: {
          variables: {
            [NICKNAME]: {
              name: 'Nickname',
              type: 'text',
              component: 'Text',
              validation: { required: true },
            },
            [CLOSENESS]: {
              name: 'Closeness',
              type: 'ordinal',
              component: 'RadioGroup',
              options: [
                {
                  id: testId('closeness-close'),
                  label: { en: 'Close' },
                  value: 1,
                },
                {
                  id: testId('closeness-distant'),
                  label: { en: 'Distant' },
                  value: 2,
                },
              ],
            },
          },
        },
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              [testVariableId('name')]: { name: 'name', type: 'text' },
              [LAYOUT]: { name: 'layout', type: 'layout' },
            },
          },
        },
        edge: { [KNOWS]: { name: 'Knows', color: 'edge-color-seq-1' } },
      },
      assets: [],
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- stage fixtures written as plain objects; the Shell reads them as the protocol's stages
      stages: stages as InterviewPayload['protocol']['stages'],
    },
  };
}

const SOUND_NAMES = Object.keys(INTERACTION_SOUND_FILES);
const isSoundName = (name: string): name is InteractionSoundName =>
  SOUND_NAMES.includes(name);

const contexts: FakeAudioContext[] = [];

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  contexts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const name = /\/([^/]+)\.mp3$/.exec(url)?.[1] ?? '';
      return Promise.resolve(
        isSoundName(name)
          ? new Response(soundBytes(name))
          : new Response(null, { status: 404 }),
      );
    }),
  );
  vi.stubGlobal(
    'AudioContext',
    class extends FakeAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
  document.elementsFromPoint ??= () => [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Renders the interview with sound on and the audio running, and returns
 * `heard`, which gives the sounds played since it was last called.
 */
async function renderInterview(
  stages: unknown[],
  nodes?: ReturnType<typeof person>[],
) {
  // Each reading of the clock is a second after the last, so no repeat
  // interval or burst window holds back a sound asked for in another task:
  // every sound the interview asks for separately is heard.
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    now += 1000;
    return now;
  });
  render(
    <Shell
      payload={payloadWith(stages, nodes)}
      onSync={() => Promise.resolve()}
      requestedLocales={[]}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      flags={{ isE2E: true }}
      interactionSounds
    />,
  );
  await act(settle);
  const [context] = contexts;
  if (!context) throw new Error('No audio context');
  context.state = 'running';
  await act(settle);
  let seen = 0;
  const heard = async () => {
    await act(settle);
    await act(settle);
    const played = context.played.slice(seen).map(soundOf);
    seen = context.played.length;
    return played;
  };
  return { heard };
}

// A press as a pointer makes it: down, then up and the click, each its own
// task as in a browser, so a sound played as the pointer goes down is not
// gathered with what the click leads to.
const press = async (name: 'Next Step' | 'Previous Step') => {
  const button = screen.getByRole('button', { name });
  await act(async () => {
    fireEvent.pointerDown(button, { button: 0 });
  });
  await act(settle);
  await act(async () => {
    fireEvent.pointerUp(button, { button: 0 });
    fireEvent.click(button);
  });
};

describe('the sound of moving through the interview', () => {
  it('plays the button sound when Next and Back move the interview, and nothing when there is nowhere to go', async () => {
    const { heard } = await renderInterview([
      information('first'),
      information('second'),
    ]);

    await press('Previous Step');
    expect(await heard()).toEqual([]);

    await press('Next Step');
    expect(await heard()).toEqual(['tap-button']);
    await screen.findByRole('heading', { name: 'second' });

    await press('Previous Step');
    expect(await heard()).toEqual(['tap-button']);
    await screen.findByRole('heading', { name: 'first' });
  });

  it('plays only the error sound when Next is refused by an ego form with errors, and the button sound once it moves on', async () => {
    const { heard } = await renderInterview([egoForm, information('after')]);
    const nickname = await screen.findByRole('textbox', {
      name: /Your nickname/,
    });

    await press('Next Step');
    expect(await heard()).toEqual(['error']);
    expect(screen.queryByRole('heading', { name: 'after' })).toBeNull();

    fireEvent.change(nickname, { target: { value: 'Sam' } });
    await press('Next Step');
    expect(await heard()).toEqual(['tap-button']);
    await screen.findByRole('heading', { name: 'after' });
  });

  it('plays the button sound when Back moves a stage to its previous pair, and nothing when an answer moves it on by itself', async () => {
    // With animations on, the census moves on after a pause rather than in
    // the task the answer was chosen in, so a sound for that move would be
    // heard on its own rather than gathered with the answer's.
    await withAnimationsEnabled(async () => {
      const { heard } = await renderInterview([dyadCensus]);

      // The answer makes a connection, and moves the census on to the next
      // pair by itself: no button was pressed.
      fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));
      await screen.findByText('Casey', undefined, { timeout: 3000 });
      expect(await heard()).toEqual(['create-edge']);

      await press('Previous Step');
      expect(await heard()).toEqual(['tap-button']);
    });
  });
});

describe('the sound of choosing an option', () => {
  it('plays the toggle sound once for an option chosen in an ego form', async () => {
    const { heard } = await renderInterview([egoForm]);

    fireEvent.click(await screen.findByRole('radio', { name: 'Close' }));
    expect(await heard()).toEqual(['toggle-on']);

    fireEvent.click(screen.getByRole('radio', { name: 'Distant' }));
    expect(await heard()).toEqual(['toggle-on']);
  });

  it('plays only the connection sound when a dyad census answer makes a connection', async () => {
    const { heard } = await renderInterview([dyadCensus]);

    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));
    expect(await heard()).toEqual(['create-edge']);
  });
});

describe('the sound of a one-to-many dyad census', () => {
  it('plays the connection sound when a person is selected, and the toggle-off sound when they are deselected', async () => {
    const { heard } = await renderInterview([oneToManyCensus]);
    const target = await screen.findByRole('option', { name: 'Blake' });

    await act(async () => {
      fireEvent.click(target);
    });
    expect(await heard()).toEqual(['create-edge']);

    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Blake' }));
    });
    expect(await heard()).toEqual(['toggle-off']);
  });
});

describe('the sound of putting a person down on the sociogram', () => {
  it('plays the drop sound once for a person dropped after a drag or placed from the drawer, and not for a keyboard nudge', async () => {
    const { heard } = await renderInterview(
      [sociogram],
      [
        person('a', 'Alex', { [LAYOUT]: { x: 0.2, y: 0.2 } }),
        person('b', 'Blake'),
      ],
    );
    await screen.findByTestId('canvas');
    const { onNodeDragEnd, onDrop } = canvas;
    if (!onNodeDragEnd || !onDrop)
      throw new Error('The canvas has no drop handlers');

    act(() => onNodeDragEnd('a', { x: 0.5, y: 0.5 }, { source: 'pointer' }));
    expect(await heard()).toEqual(['drop-node']);

    act(() => onDrop('b', { x: 0.7, y: 0.3 }));
    expect(await heard()).toEqual(['drop-node']);

    act(() => onNodeDragEnd('a', { x: 0.52, y: 0.5 }, { source: 'keyboard' }));
    expect(await heard()).toEqual([]);
  });
});
