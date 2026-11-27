import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';
import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';
import {
  FakeAudioContext,
  settle,
  fileNameOf,
  SOUND_FILE_NAMES,
  soundBytes,
  soundOf,
} from '../sounds/__tests__/fakeAudioContext';
import { testId, testTypeId, testVariableId } from './testIds';

// The sounds the interview's own stages ask for, heard through the real
// Shell, store and sound engine, with only the audio output faked.

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const NAME = testVariableId('name');
const NICKNAME = testVariableId('nickname');
const CLOSENESS = testVariableId('closeness');
const LAYOUT = testVariableId('layout');
const RANK = testVariableId('rank');
const GROUP = testVariableId('group');
const OTHER_GROUP = testVariableId('other-group');
const SECRET = testVariableId('secret');

const person = (
  id: string,
  name: string,
  attributes = {},
  extra: Record<string, unknown> = {},
) => ({
  [entityPrimaryKeyProperty]: id,
  type: PERSON,
  [entityAttributesProperty]: { [NAME]: name, ...attributes },
  ...extra,
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
  form: formOf(
    [
      { id: 'f1', variable: NICKNAME, prompt: { en: 'Your nickname' } },
      { id: 'f2', variable: CLOSENESS, prompt: { en: 'How close' } },
    ],
    { before: '# About you' },
  ),
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

const ROSTER_ASSET = 'roster-asset';
const ROSTER_URL = 'https://assets.test/roster.json';
// The people a name generator's panel offers, from the protocol's roster.
const ROSTER = { nodes: [{ attributes: { name: 'Dana' } }] };

// A name generator with a list of the people named for its question, a panel
// offering people from a roster, and the bin.
const nameGenerator = {
  id: testId('name-generator'),
  type: 'NameGeneratorQuickAdd',
  label: { en: 'Name people' },
  subject: { entity: 'node', type: PERSON },
  quickAdd: asEntityAttributeReference(NAME),
  addNamePlaceholder: { en: 'Type a name, then press Enter' },
  panels: [
    {
      id: testId('panel'),
      title: { en: 'People you might know' },
      dataSource: ROSTER_ASSET,
    },
  ],
  prompts: [{ id: testId('ng-p1'), text: { en: 'Who do you know?' } }],
};

// A name generator whose panel offers the people already in the network who
// were named for another question.
const networkPanelNameGenerator = {
  ...nameGenerator,
  id: testId('network-name-generator'),
  panels: [
    {
      id: testId('network-panel'),
      title: { en: 'People you named before' },
      dataSource: 'existing',
    },
  ],
  prompts: [{ id: testId('nng-p1'), text: { en: 'Who do you see often?' } }],
};

// A person in the network, named for a question on an earlier stage.
const namedBefore = (id: string, name: string) =>
  person(
    id,
    name,
    {},
    { promptIDs: [testId('earlier-p1')], stageId: testId('earlier') },
  );

const named = (id: string, name: string) =>
  person(
    id,
    name,
    {},
    { promptIDs: [testId('ng-p1')], stageId: testId('name-generator') },
  );

const ordinalBin = {
  id: testId('ordinal'),
  type: 'OrdinalBin',
  label: { en: 'Rank people' },
  subject: { entity: 'node', type: PERSON },
  prompts: [
    {
      id: testId('ord-p1'),
      text: { en: 'How often do you see them?' },
      variable: asEntityAttributeReference(RANK),
      color: 'ord-color-seq-1',
    },
  ],
};

const categoricalBin = {
  id: testId('categorical'),
  type: 'CategoricalBin',
  label: { en: 'Group people' },
  subject: { entity: 'node', type: PERSON },
  prompts: [
    {
      id: testId('cat-p1'),
      text: { en: 'How do you know them?' },
      variable: asEntityAttributeReference(GROUP),
      otherVariable: asEntityAttributeReference(OTHER_GROUP),
      otherVariablePrompt: { en: 'How else do you know them?' },
      otherOptionLabel: { en: 'Some other way' },
    },
  ],
};

// A categorical bin whose "other" answer is stored encrypted, so it can be
// given only once the interview's passphrase is entered.
const protectedCategoricalBin = {
  ...categoricalBin,
  id: testId('protected-categorical'),
  prompts: [
    {
      id: testId('pcat-p1'),
      text: { en: 'How do you know them?' },
      variable: asEntityAttributeReference(GROUP),
      otherVariable: asEntityAttributeReference(SECRET),
      otherVariablePrompt: { en: 'How else do you know them?' },
      otherOptionLabel: { en: 'Some other way' },
    },
  ],
};

// The bins in select mode, where a person is placed by choosing a bin.
const selectOrdinalBin = {
  ...ordinalBin,
  id: testId('select-ordinal'),
  behaviours: { interactionMode: 'select' },
};
const selectCategoricalBin = {
  ...categoricalBin,
  id: testId('select-categorical'),
  behaviours: { interactionMode: 'select' },
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
              [NAME]: { name: 'name', type: 'text' },
              [LAYOUT]: { name: 'layout', type: 'layout' },
              [RANK]: {
                name: 'rank',
                type: 'ordinal',
                component: 'LikertScale',
                options: [
                  {
                    id: testId('rank-often'),
                    label: { en: 'Often' },
                    value: 1,
                  },
                  {
                    id: testId('rank-rarely'),
                    label: { en: 'Rarely' },
                    value: 2,
                  },
                ],
              },
              [GROUP]: {
                name: 'group',
                type: 'categorical',
                component: 'CheckboxGroup',
                options: [
                  { id: testId('group-work'), label: { en: 'Work' }, value: 1 },
                  {
                    id: testId('group-school'),
                    label: { en: 'School' },
                    value: 2,
                  },
                ],
              },
              [OTHER_GROUP]: {
                name: 'other group',
                type: 'text',
                component: 'Text',
              },
              [SECRET]: { name: 'secret', type: 'text', encrypted: true },
            },
          },
        },
        edge: { [KNOWS]: { name: 'Knows', color: 'edge-color-seq-1' } },
      },
      assets: [
        {
          assetId: ROSTER_ASSET,
          name: 'roster',
          type: 'network',
          source: 'roster.json',
        },
      ],
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- stage fixtures written as plain objects; the Shell reads them as the protocol's stages
      stages: stages as InterviewPayload['protocol']['stages'],
    },
  };
}

const contexts: FakeAudioContext[] = [];

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no layout, so it cannot say what is under the pointer: a drag
// test names the element it moves the pointer over. Nor does it have pointer
// capture.
let underPointer: Element[] = [];
const POINTER_CAPTURE = [
  'setPointerCapture',
  'hasPointerCapture',
  'releasePointerCapture',
] as const;

beforeEach(() => {
  contexts.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === ROSTER_URL) return Promise.resolve(Response.json(ROSTER));
      const name = fileNameOf(url);
      return Promise.resolve(
        SOUND_FILE_NAMES.includes(name)
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
  underPointer = [];
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => underPointer,
  });
  for (const method of POINTER_CAPTURE) {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      value: () => false,
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'elementsFromPoint');
  for (const method of POINTER_CAPTURE) {
    Reflect.deleteProperty(Element.prototype, method);
  }
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
      onRequestAsset={(assetId) =>
        Promise.resolve(assetId === ROSTER_ASSET ? ROSTER_URL : '')
      }
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

type Heard = () => Promise<(string | undefined)[]>;

const nextFrame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

const dropZone = (id: string) => {
  const zone = document.querySelector(`[data-zone-id="${id}"]`);
  if (!zone) throw new Error(`No drop target ${id}`);
  return zone;
};

/**
 * Drags `source` with a pointer, past the drag distance, and releases it over
 * `over` (over nothing when null). The pointer's events go to `source`, as
 * the pointer capture a drag takes sends them in a browser. Gives what was heard as the drag started,
 * and what was heard as it ended; each step is its own task, as in a browser.
 */
async function pointerDrag(
  heard: Heard,
  source: Element,
  over: Element | null,
) {
  const at = (clientX: number) => ({ pointerId: 1, clientX, clientY: 100 });
  await act(async () => {
    fireEvent.pointerDown(source, { ...at(100), button: 0 });
  });
  await act(async () => {
    fireEvent.pointerMove(source, at(140));
    await nextFrame();
  });
  const pickedUp = await heard();
  underPointer = over ? [over] : [];
  await act(async () => {
    fireEvent.pointerMove(source, at(150));
    await nextFrame();
  });
  await act(async () => {
    fireEvent.pointerUp(source, at(150));
  });
  const dropped = await heard();
  return { pickedUp, dropped };
}

/** What the drag and drop announcements say now. */
const announced = () =>
  [...document.querySelectorAll('[role="status"]')]
    .map((region) => region.textContent ?? '')
    .join('\n');

/**
 * Picks `source` up from the keyboard, moves through the drop targets to the
 * one named `targetName`, and drops it there; with no target, cancels the
 * drag instead. Gives what was heard as the drag started, and what was heard
 * as it ended.
 */
async function keyboardDrag(
  heard: Heard,
  source: HTMLElement,
  targetName: string | null,
) {
  await act(async () => {
    source.focus();
    fireEvent.keyDown(source, { key: 'd', ctrlKey: true });
  });
  const pickedUp = await heard();
  if (targetName === null) {
    await act(async () => {
      fireEvent.keyDown(source, { key: 'Escape' });
    });
  } else {
    for (let step = 0; !announced().includes(`: ${targetName}`); step += 1) {
      if (step === 10) throw new Error(`No drop target ${targetName}`);
      await act(async () => {
        fireEvent.keyDown(source, { key: 'ArrowDown' });
      });
    }
    await act(async () => {
      fireEvent.keyDown(source, { key: 'Enter' });
    });
  }
  const dropped = await heard();
  return { pickedUp, dropped };
}

// The people a stage shows, by their label: a list's or a drawer's, or the
// canvas's.
const personNamed = (name: string, scope: HTMLElement = document.body) =>
  within(scope).findByLabelText(name, { selector: 'button' });

describe('the sound of dragging a person on a name generator', () => {
  const stageNodes = () =>
    screen.getByTestId('node-list').querySelectorAll('[data-collection-item]');

  it('plays the pick-up sound when a drag starts, and only the bin’s sound when the person is dropped in it', async () => {
    const { heard } = await renderInterview(
      [nameGenerator],
      [named('a', 'Alex'), named('b', 'Blake')],
    );
    const list = await screen.findByTestId('node-list');
    const alex = await personNamed('Alex', list);
    await act(settle);
    expect(await heard()).toEqual([]);

    expect(await pointerDrag(heard, alex, dropZone('node-bin'))).toEqual({
      pickedUp: ['pick-up'],
      dropped: ['discard'],
    });
    await waitFor(() => expect(stageNodes()).toHaveLength(1));
  });

  it('plays only the sound of adding a person when one from a roster panel is dropped on the list, and only the panel’s sound when they are taken back', async () => {
    const { heard } = await renderInterview(
      [nameGenerator],
      [named('a', 'Alex')],
    );
    const dana = await personNamed(
      'Dana',
      await screen.findByTestId('node-panel'),
    );

    // Adding a person from the roster adds a new node to the network, which
    // makes no second sound of its own.
    expect(await keyboardDrag(heard, dana, 'Added Nodes')).toEqual({
      pickedUp: ['pick-up'],
      dropped: ['create-node'],
    });
    await waitFor(() => expect(stageNodes()).toHaveLength(2));

    // Taking them back removes them from the network, which on its own
    // sounds like a person deleted.
    const added = await personNamed('Dana', screen.getByTestId('node-list'));
    expect(await keyboardDrag(heard, added, 'People you might know')).toEqual({
      pickedUp: ['pick-up'],
      dropped: ['toggle-off'],
    });
    await waitFor(() => expect(stageNodes()).toHaveLength(1));
  });

  it('plays only the list’s sound when a person already in the network is dropped on it from a panel, and only the panel’s sound when they are taken back', async () => {
    const { heard } = await renderInterview(
      [networkPanelNameGenerator],
      [namedBefore('b', 'Blake')],
    );
    const blake = await personNamed(
      'Blake',
      await screen.findByTestId('node-panel'),
    );

    // Adding them to this question adds no node: it is heard as the list's
    // sound, and the change it makes, which on its own sounds like a person
    // selected, makes no second sound.
    expect(await keyboardDrag(heard, blake, 'Added Nodes')).toEqual({
      pickedUp: ['pick-up'],
      dropped: ['toggle-on'],
    });
    await waitFor(() => expect(stageNodes()).toHaveLength(1));

    const added = await personNamed('Blake', screen.getByTestId('node-list'));
    expect(await keyboardDrag(heard, added, 'People you named before')).toEqual(
      {
        pickedUp: ['pick-up'],
        dropped: ['toggle-off'],
      },
    );
    await waitFor(() => expect(stageNodes()).toHaveLength(0));
  });

  it('plays nothing as a drag ends that is cancelled or dropped where nothing takes the person, and nothing for a press that does not drag', async () => {
    const { heard } = await renderInterview(
      [nameGenerator],
      [named('a', 'Alex')],
    );
    const list = await screen.findByTestId('node-list');
    await act(settle);
    await heard();

    expect(
      await keyboardDrag(heard, await personNamed('Alex', list), null),
    ).toEqual({ pickedUp: ['pick-up'], dropped: [] });

    expect(
      await pointerDrag(heard, await personNamed('Alex', list), null),
    ).toEqual({ pickedUp: ['pick-up'], dropped: [] });
    expect(stageNodes()).toHaveLength(1);

    const alex = await personNamed('Alex', list);
    await act(async () => {
      fireEvent.pointerDown(alex, { pointerId: 1, button: 0, clientX: 100 });
    });
    await act(async () => {
      fireEvent.pointerUp(document, { pointerId: 1, clientX: 100 });
      fireEvent.click(alex);
    });
    expect(await heard()).toEqual([]);
  });

  it('keeps the sound of a person added without a drag', async () => {
    const { heard } = await renderInterview([nameGenerator], []);
    fireEvent.click(await screen.findByTestId('quick-add-toggle'));
    const input = await screen.findByRole('textbox', {
      name: 'Type a name, then press Enter',
    });
    await heard();
    fireEvent.change(input, { target: { value: 'Emery' } });
    await act(async () => {
      fireEvent.submit(input);
    });
    await waitFor(() => expect(stageNodes()).toHaveLength(1));
    expect(await heard()).toEqual(['create-node']);
  });
});

describe('the sound of a drop that needs the passphrase', () => {
  const passphraseDialog = () =>
    screen.queryByRole('dialog', { name: 'Passphrase' });
  const otherQuestion = () =>
    screen.queryByRole('dialog', { name: 'Some other way' });

  it('plays nothing for a drop refused until the passphrase is entered, and the bin’s sound once for one made after', async () => {
    const { heard } = await renderInterview([protectedCategoricalBin]);

    // Without the passphrase the "other" answer cannot be stored, so the
    // drop places nobody and asks for it instead.
    expect(
      await keyboardDrag(
        heard,
        await personNamed('Alex'),
        'Category: Some other way',
      ),
    ).toEqual({ pickedUp: ['pick-up'], dropped: [] });
    const lock = await screen.findByRole('button', { name: 'Passphrase' });
    expect(otherQuestion()).toBeNull();

    // Asked for the passphrase, the participant closes the question.
    fireEvent.click(lock);
    const dismissed = await screen.findByRole('dialog', { name: 'Passphrase' });
    fireEvent.keyDown(dismissed, { key: 'Escape' });
    await waitFor(() => expect(passphraseDialog()).toBeNull());
    expect(await heard()).toEqual([]);

    // Then chooses one, and drops the person again.
    fireEvent.click(screen.getByRole('button', { name: 'Passphrase' }));
    const dialog = await screen.findByRole('dialog', { name: 'Passphrase' });
    for (const field of within(dialog).getAllByLabelText(/Passphrase/, {
      selector: 'input',
    })) {
      fireEvent.change(field, { target: { value: 'eight888' } });
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(passphraseDialog()).toBeNull(), {
      timeout: 10_000,
    });
    await heard();

    expect(
      await keyboardDrag(
        heard,
        await personNamed('Alex'),
        'Category: Some other way',
      ),
    ).toEqual({ pickedUp: ['pick-up'], dropped: [] });
    // The bin's sound waits until the answer is protected and stored, and is
    // heard once.
    const question = await screen.findByRole('dialog', {
      name: 'Some other way',
    });
    fireEvent.change(within(question).getByRole('textbox'), {
      target: { value: 'Neighbours' },
    });
    await act(async () => {
      fireEvent.click(within(question).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(otherQuestion()).toBeNull(), {
      timeout: 10_000,
    });
    expect(await heard()).toEqual(['toggle-on']);
  });
});

describe('the sound of dragging a person into a bin', () => {
  it('plays the pick-up sound, then the drop sound, for a person dropped in an ordinal bin', async () => {
    const { heard } = await renderInterview([ordinalBin]);
    const alex = await personNamed('Alex');
    expect(
      await keyboardDrag(heard, alex, "Container for the value 'Often'"),
    ).toEqual({ pickedUp: ['pick-up'], dropped: ['toggle-on'] });
  });

  it('plays the drop sound for a person dropped in a categorical bin, and for one dropped in "other" only once the answer is saved', async () => {
    const { heard } = await renderInterview([categoricalBin]);

    expect(
      await keyboardDrag(heard, await personNamed('Alex'), 'Category: Work'),
    ).toEqual({ pickedUp: ['pick-up'], dropped: ['toggle-on'] });

    expect(
      await keyboardDrag(
        heard,
        await personNamed('Blake'),
        'Category: Some other way',
      ),
    ).toEqual({ pickedUp: ['pick-up'], dropped: [] });
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Neighbours' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await heard()).toEqual(['toggle-on']);

    expect(
      await keyboardDrag(
        heard,
        await personNamed('Casey'),
        'Category: Some other way',
      ),
    ).toEqual({ pickedUp: ['pick-up'], dropped: [] });
    const cancelled = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(
        within(cancelled).getByRole('button', { name: 'Cancel' }),
      );
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await heard()).toEqual([]);
  });
});

describe('the sound of placing a person in a bin by choosing it', () => {
  it('plays the drop sound once for a person placed in an ordinal bin', async () => {
    const { heard } = await renderInterview([selectOrdinalBin]);
    const often = await screen.findByRole('button', {
      name: 'Place Alex in Often',
    });
    await heard();
    await act(async () => {
      fireEvent.click(often);
    });
    expect(await heard()).toEqual(['toggle-on']);
  });

  it('plays the drop sound once for a person placed in a categorical bin, and for one placed in "other" only once the answer is saved', async () => {
    const { heard } = await renderInterview([selectCategoricalBin]);
    const work = await screen.findByRole('button', {
      name: 'Place Alex in Work',
    });
    await heard();
    await act(async () => {
      fireEvent.click(work);
    });
    expect(await heard()).toEqual(['toggle-on']);

    const other = await screen.findByRole('button', {
      name: 'Place Blake in Some other way',
    });
    await act(async () => {
      fireEvent.click(other);
    });
    const dialog = await screen.findByRole('dialog');
    expect(await heard()).toEqual([]);
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Neighbours' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await heard()).toEqual(['toggle-on']);
  });
});

describe('the sound of dragging a person on the sociogram', () => {
  it('plays the pick-up and drop sounds for a person placed from the drawer or moved on the canvas, the drawer’s sound for one put back, and nothing for a keyboard nudge', async () => {
    const { heard } = await renderInterview(
      [sociogram],
      [
        person('a', 'Alex', { [LAYOUT]: { x: 0.2, y: 0.2 } }),
        person('b', 'Blake'),
      ],
    );
    const canvasArea = await screen.findByRole('application', {
      name: 'Placement area',
    });

    expect(
      await keyboardDrag(heard, await personNamed('Blake'), 'Placement area'),
    ).toEqual({ pickedUp: ['pick-up'], dropped: ['drop-node'] });

    const alex = await personNamed('Alex', canvasArea);
    expect(await pointerDrag(heard, alex, canvasArea)).toEqual({
      pickedUp: ['pick-up'],
      dropped: ['drop-node'],
    });

    await act(async () => {
      alex.focus();
      fireEvent.keyDown(alex, { key: 'ArrowRight' });
    });
    expect(await heard()).toEqual([]);

    expect(await pointerDrag(heard, alex, dropZone('node-drawer'))).toEqual({
      pickedUp: ['pick-up'],
      dropped: ['toggle-off'],
    });
    await waitFor(() =>
      expect(
        within(canvasArea).queryByRole('button', { name: 'Alex' }),
      ).toBeNull(),
    );
  });
});
