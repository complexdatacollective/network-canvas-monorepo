import { DOMParser, type Element, MIME_TYPE } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { FormattedSession } from '../../../input';
import type { ExportWarning } from '../../../output';
import {
  exportOptions,
  namesCodebook,
  namesSession,
  prepareSession,
} from '../../__tests__/namesFixture';
import graphMLGenerator from '../createGraphML';
import { sha1 } from '../helpers';

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
        label: { en: 'Person' },
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
        'v-1': { name: 'name', label: 'Name', type: 'text' },
        'v-2': {
          name: 'a.b-c:d_e',
          label: 'A b c d e',
          type: 'number',
        },
        'v-3': { name: '年齢', label: '年齢', type: 'number' },
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
        'v-space': { name: 'a b', label: 'A b', type: 'text' },
        'v-question': { name: 'a?b', label: 'A b', type: 'text' },
        'v-valid': { name: 'a_b', label: 'A b', type: 'text' },
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
      personCodebook({
        'v-1': { name: 'R&D <team>', label: 'R d team', type: 'text' },
      }),
      sessionWithNode({ 'v-1': 'x' }),
    );

    expect(descOf(keyById(keyElements(xml), 'v-1'))).toBe('R&D <team>');
    expect(xml).toContain('<desc>R&amp;D &lt;team&gt;</desc>');
  });
});

describe('GraphML keys for variables whose id is a built-in key id', () => {
  const codebook = personCodebook({
    label: { name: 'Nickname', label: 'Nickname', type: 'text' },
    networkCanvasType: { name: 'Kind', label: 'Kind', type: 'text' },
    networkCanvasUUID: {
      name: 'Reference',
      label: 'Reference',
      type: 'text',
    },
    plain: { name: 'Plain', label: 'Plain', type: 'text' },
    label_1: {
      name: 'Second nickname',
      label: 'Second nickname',
      type: 'text',
    },
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

describe('GraphML key ids that would be the same', () => {
  // `pos_X` is a variable id, and also the id the layout variable `pos` would
  // give its X key. The options 1 and '1' would get the same hashed id.
  // `nickname` is not declared, and the variable `hashed` has the id it would
  // be given.
  const renderWithHashedId = async (hashed: string) => {
    const codebook = personCodebook({
      pos_X: {
        name: 'Position text',
        label: 'Position text',
        type: 'text',
      },
      pos: { name: 'Position', label: 'Position', type: 'layout' },
      rating: {
        name: 'Rating',
        label: 'Rating',
        type: 'categorical',
        options: [
          { label: { en: 'One' }, value: 1 },
          { label: { en: 'Also one' }, value: '1' },
        ],
      },
      [hashed]: { name: 'Hashed', label: 'Hashed', type: 'text' },
    });
    const session: FormattedSession = {
      ...sessionWithNode({}),
      nodes: [
        {
          [entityPrimaryKeyProperty]: 'node-a',
          type: 'person',
          [entityAttributesProperty]: {
            pos_X: 'written',
            pos: { x: 0.25, y: 0.75 },
            rating: ['1'],
            [hashed]: 'hashed value',
            nickname: 'Dee',
          },
        },
      ],
    };
    return graphMLGenerator(
      prepareSession(session),
      codebook,
      exportOptions(false),
      () => undefined,
    );
  };

  it('gives every key an id of its own, built-in keys included', async () => {
    const xml = await renderWithHashedId(await sha1('nickname'));
    const ids = keyElements(xml).map((key) => key.getAttribute('id'));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes each value under the key of its own column', async () => {
    const hashed = await sha1('nickname');
    const xml = await renderWithHashedId(hashed);
    const keys = keyElements(xml);
    const attrNameById = new Map(
      keys.map((key) => [
        key.getAttribute('id'),
        key.getAttribute('attr.name'),
      ]),
    );
    const byAttrName = new Map(
      nodeData(xml, 0).map(([id, value]) => [attrNameById.get(id), value]),
    );

    expect(byAttrName.get('Position_text')).toBe('written');
    expect(byAttrName.get('Position_X')).toBe('0.25');
    expect(byAttrName.get('Position_Y')).toBe('0.75');
    expect(byAttrName.get('Rating_1')).toBe('false');
    expect(byAttrName.get('Rating_1_2')).toBe('true');
    expect(byAttrName.get('Hashed')).toBe('hashed value');
    expect(byAttrName.get('nickname')).toBe('Dee');
    expect(keyById(keys, 'pos_X').getAttribute('attr.name')).toBe(
      'Position_text',
    );
    expect(keyById(keys, hashed).getAttribute('attr.name')).toBe('Hashed');
  });
});

describe('GraphML columns the export renames', () => {
  const renderReporting = async (
    codebook: Codebook,
    session: FormattedSession,
  ) => {
    const warnings: ExportWarning[] = [];
    const xml = await graphMLGenerator(
      prepareSession(session),
      codebook,
      exportOptions(false),
      (warning) => warnings.push(warning),
    );
    return { xml, warnings };
  };

  const renamed = (
    entityTypeName: string,
    variable: string,
    column: string,
    renamedTo: string,
  ): ExportWarning => ({
    kind: 'column-renamed',
    protocolName: 'protocol name',
    format: 'graphml',
    entity: 'node',
    entityTypeName,
    variable,
    column,
    renamedTo,
  });

  it('reports each column numbered to keep it apart from another', async () => {
    const { xml, warnings } = await renderReporting(
      personCodebook({
        'v-label': { name: 'label', label: 'Label', type: 'text' },
        'v-text': { name: 'pos_X', label: 'Pos x', type: 'text' },
        'v-layout': { name: 'pos', label: 'Pos', type: 'layout' },
        'v-space': { name: 'a b', label: 'A b', type: 'text' },
        'v-valid': { name: 'a_b', label: 'A b', type: 'text' },
      }),
      sessionWithNode({ 'v-label': 'Dee' }),
    );
    const keys = keyElements(xml);

    expect(keyById(keys, 'v-label').getAttribute('attr.name')).toBe('label_2');
    expect(keyById(keys, 'v-layout_X').getAttribute('attr.name')).toBe(
      'pos_X_2',
    );
    expect(warnings).toEqual([
      renamed('Person', 'label', 'label', 'label_2'),
      renamed('Person', 'pos', 'pos_X', 'pos_X_2'),
      renamed('Person', 'a b', 'a_b', 'a_b_2'),
    ]);
  });

  it('does not report a name made into a valid attr.name, or one shared by two types', async () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'p-name': {
              name: 'Full name',
              label: 'Full name',
              type: 'text',
            },
          },
        },
        place: {
          name: 'Place',
          label: { en: 'Place' },
          color: 'node-color-seq-2',
          shape: { default: 'circle' },
          variables: {
            'pl-name': {
              name: 'Full name',
              label: 'Full name',
              type: 'text',
            },
          },
        },
      },
    } satisfies Codebook;
    const { xml, warnings } = await renderReporting(
      codebook,
      sessionWithNode({ 'p-name': 'Dee' }),
    );
    const keys = keyElements(xml);

    expect(keyById(keys, 'p-name').getAttribute('attr.name')).toBe('Full_name');
    expect(keyById(keys, 'pl-name').getAttribute('attr.name')).toBe(
      'Full_name',
    );
    expect(warnings).toEqual([]);
  });
});
