import { DOMParser, type Element, MIME_TYPE } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { FormattedSession } from '../../../input';
import {
  exportOptions,
  namesCodebook,
  namesSession,
  prepareSession,
} from '../../__tests__/namesFixture';
import graphMLGenerator from '../createGraphML';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, MIME_TYPE.XML_APPLICATION);

const keyElements = (xml: string) =>
  Array.from(parse(xml).getElementsByTagName('key'));

const keyById = (keys: readonly Element[], id: string) => {
  const key = keys.find((candidate) => candidate.getAttribute('id') === id);
  if (!key) throw new Error(`No key with id ${id}`);
  return key;
};

const descOf = (key: Element) =>
  key.getElementsByTagName('desc')[0]?.textContent ?? null;

const nodeData = (xml: string, nodeIndex: number) =>
  Array.from(
    Array.from(parse(xml).getElementsByTagName('node'))[
      nodeIndex
    ]?.getElementsByTagName('data') ?? [],
  ).map((data) => [data.getAttribute('key'), data.textContent] as const);

const personCodebook = (
  variables: NonNullable<NonNullable<Codebook['node']>[string]['variables']>,
) =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables,
      },
    },
  }) satisfies Codebook;

const sessionWithNode = (
  attributes: Record<string, string | number | boolean>,
): FormattedSession => ({
  ...namesSession(),
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'node-a',
      type: 'person',
      [entityAttributesProperty]: attributes,
    },
  ],
  edges: [],
  ego: { [entityPrimaryKeyProperty]: 'ego-1', [entityAttributesProperty]: {} },
});

const render = (
  codebook: Codebook,
  session: FormattedSession,
  useScreenLayoutCoordinates = true,
) =>
  graphMLGenerator(
    prepareSession(session),
    codebook,
    exportOptions(useScreenLayoutCoordinates),
    () => undefined,
  );

describe('GraphML keys for names in other scripts, with spaces and punctuation', () => {
  let xml = '';
  let keys: Element[] = [];

  beforeAll(async () => {
    xml = await render(namesCodebook, namesSession());
    keys = keyElements(xml);
  });

  it('writes a valid attr.name and keeps the original name in <desc>', () => {
    const key = keyById(keys, 'p-name');

    expect(key.getAttribute('attr.name')).toBe('Full_name');
    expect(descOf(key)).toBe('Full name');
    expect(key.getAttribute('for')).toBe('node');
  });

  it('puts <desc> first in the <key>, where the GraphML schema allows it', () => {
    const key = keyById(keys, 'p-age');

    expect(key.getAttribute('attr.name')).toBe('年齢__years_');
    expect(key.firstChild).toBe(key.getElementsByTagName('desc')[0]);
  });

  it('lets variables of different types that share a name share an attr.name', () => {
    expect(keyById(keys, 'pl-name').getAttribute('attr.name')).toBe(
      'Full_name',
    );
  });

  it('writes the layout keys in the order X, screenSpaceY, screenSpaceX, Y', () => {
    const layoutKeys = keys.filter((key) =>
      key.getAttribute('id')?.startsWith('p-pos_'),
    );

    expect(layoutKeys.map((key) => key.getAttribute('id'))).toEqual([
      'p-pos_X',
      'p-pos_screenSpaceY',
      'p-pos_screenSpaceX',
      'p-pos_Y',
    ]);
    expect(layoutKeys.map(descOf)).toEqual([
      'map position_X',
      'map position_screenSpaceY',
      'map position_screenSpaceX',
      'map position_Y',
    ]);
    expect(layoutKeys.map((key) => key.getAttribute('attr.name'))).toEqual([
      'map_position_X',
      'map_position_screenSpaceY',
      'map_position_screenSpaceX',
      'map_position_Y',
    ]);
  });

  it('names each categorical option after the variable and the option value', () => {
    const optionKeys = keys.filter((key) =>
      key.getAttribute('id')?.startsWith('p-eyes_'),
    );

    expect(optionKeys.map(descOf)).toEqual([
      'Eye colour, "natural"_light blue',
      'Eye colour, "natural"_褐色',
      'Eye colour, "natural"_5',
    ]);
    expect(optionKeys.map((key) => key.getAttribute('attr.name'))).toEqual([
      'Eye_colour___natural__light_blue',
      'Eye_colour___natural__褐色',
      'Eye_colour___natural__5',
    ]);
  });

  it('keeps the data under the key ids, which do not depend on names', () => {
    const data = new Map(nodeData(xml, 0));

    expect(data.get('p-name')).toBe('Dee');
    expect(data.get('p-age')).toBe('40');
    expect(data.get('p-rank')).toBe('2');
  });

  it('declares only ids and attr.names that are NMTOKENs', () => {
    for (const key of keys) {
      expect(key.getAttribute('id')).toMatch(/^[\w.:-]+$/);
      expect(key.getAttribute('attr.name')).not.toMatch(/[\s"'<>&,()/]/);
    }
  });
});

describe('GraphML keys for names that are already valid', () => {
  it('leaves attr.name as written and adds no <desc>', async () => {
    const xml = await render(
      personCodebook({
        'v-1': { name: 'name', type: 'text' },
        'v-2': { name: 'a.b-c:d_e', type: 'number' },
        'v-3': { name: '年齢', type: 'number' },
      }),
      sessionWithNode({ 'v-1': 'Dee', 'v-2': 1, 'v-3': 2 }),
    );
    const keys = keyElements(xml);

    expect(
      ['v-1', 'v-2', 'v-3'].map((id) =>
        keyById(keys, id).getAttribute('attr.name'),
      ),
    ).toEqual(['name', 'a.b-c:d_e', '年齢']);
    expect(xml).not.toContain('<desc');
  });
});

describe('GraphML keys for names that derive the same attr.name', () => {
  it('numbers them in codebook order, and each <desc> says which is which', async () => {
    const xml = await render(
      personCodebook({
        'v-space': { name: 'a b', type: 'text' },
        'v-question': { name: 'a?b', type: 'text' },
        'v-valid': { name: 'a_b', type: 'text' },
      }),
      sessionWithNode({
        'v-space': 'one',
        'v-question': 'two',
        'v-valid': 'three',
      }),
    );
    const keys = keyElements(xml);

    expect(keyById(keys, 'v-valid').getAttribute('attr.name')).toBe('a_b');
    expect(descOf(keyById(keys, 'v-valid'))).toBeNull();
    expect(keyById(keys, 'v-space').getAttribute('attr.name')).toBe('a_b_2');
    expect(descOf(keyById(keys, 'v-space'))).toBe('a b');
    expect(keyById(keys, 'v-question').getAttribute('attr.name')).toBe('a_b_3');
    expect(descOf(keyById(keys, 'v-question'))).toBe('a?b');
    expect(new Map(nodeData(xml, 0))).toEqual(
      new Map([
        ['networkCanvasUUID', 'node-a'],
        ['networkCanvasType', 'Person'],
        ['label', 'one'],
        ['v-space', 'one'],
        ['v-question', 'two'],
        ['v-valid', 'three'],
      ]),
    );
  });

  it('escapes the original name in <desc>', async () => {
    const xml = await render(
      personCodebook({ 'v-1': { name: 'R&D <team>', type: 'text' } }),
      sessionWithNode({ 'v-1': 'x' }),
    );

    expect(descOf(keyById(keyElements(xml), 'v-1'))).toBe('R&D <team>');
    expect(xml).toContain('<desc>R&amp;D &lt;team&gt;</desc>');
  });
});

describe('GraphML keys for variables whose id is a built-in key id', () => {
  const codebook = personCodebook({
    label: { name: 'Nickname', type: 'text' },
    networkCanvasType: { name: 'Kind', type: 'text' },
    networkCanvasUUID: { name: 'Reference', type: 'text' },
    plain: { name: 'Plain', type: 'text' },
    label_1: { name: 'Second nickname', type: 'text' },
  });
  const session = sessionWithNode({
    label: 'Dee',
    networkCanvasType: 'friend',
    networkCanvasUUID: 'abc',
    plain: 'p',
    label_1: 'Deedee',
  });

  it('declares every key id once', async () => {
    const ids = keyElements(await render(codebook, session)).map((key) =>
      key.getAttribute('id'),
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('moves the variable to an id of its own, and nothing else', async () => {
    const keys = keyElements(await render(codebook, session));

    expect(keyById(keys, 'label_2').getAttribute('attr.name')).toBe('Nickname');
    expect(keyById(keys, 'networkCanvasType_1').getAttribute('attr.name')).toBe(
      'Kind',
    );
    expect(keyById(keys, 'networkCanvasUUID_1').getAttribute('attr.name')).toBe(
      'Reference',
    );
    expect(keyById(keys, 'plain').getAttribute('attr.name')).toBe('Plain');
    expect(keyById(keys, 'label_1').getAttribute('attr.name')).toBe(
      'Second_nickname',
    );
  });

  it('leaves the built-in keys to the export', async () => {
    const keys = keyElements(await render(codebook, session));

    expect(keyById(keys, 'label').getAttribute('for')).toBe('all');
    expect(keyById(keys, 'label').getAttribute('attr.name')).toBe('label');
    expect(keyById(keys, 'networkCanvasType').getAttribute('for')).toBe('all');
  });

  it("writes the variable's value under its own key and the built-in values under theirs", async () => {
    const data = new Map(nodeData(await render(codebook, session), 0));

    expect(data.get('label')).toBe('Dee');
    expect(data.get('label_2')).toBe('Dee');
    expect(data.get('label_1')).toBe('Deedee');
    expect(data.get('networkCanvasType')).toBe('Person');
    expect(data.get('networkCanvasType_1')).toBe('friend');
    expect(data.get('networkCanvasUUID')).toBe('node-a');
    expect(data.get('networkCanvasUUID_1')).toBe('abc');
  });
});
