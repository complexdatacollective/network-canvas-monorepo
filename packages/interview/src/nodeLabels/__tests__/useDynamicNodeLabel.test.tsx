import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Codebook,
  dynamicValueNameFor,
  getLocaleMetadata,
  type NodeLabel,
  NodeLabelSchema,
  optionCaseKey,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { createInitialNetwork } from '../../contract/network';
import type { InterviewPayload } from '../../contract/types';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  useNodeLabel,
  useNodeLabeller,
} from '../../interfaces/Anonymisation/useNodeLabel';
import { addEdge } from '../../store/modules/session';
import { store as createStore } from '../../store/store';

const PLACE = testTypeId('place');
const NEAR = testTypeId('near');
const FAR = testTypeId('far');
const NAME_VAR = testVariableId('nameVar');
const KIND = testVariableId('kind');
const BEDS = testVariableId('beds');
const HOSPITAL = testId('option hospital');
const SCHOOL = testId('option school');

/** The names a label's text gives what it shows. */
const NAMES = {
  name: dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: NAME_VAR,
  }),
  kind: dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: KIND,
  }),
  beds: dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: BEDS,
  }),
  label: dynamicValueNameFor({ kind: 'label', role: 'node' }),
};
const HOSPITAL_CASE = optionCaseKey(HOSPITAL);
const SCHOOL_CASE = optionCaseKey(SCHOOL);
/** A condition's id, and the name text gives it. */
const conditionNamed = (label: string) => {
  const id = testId(`condition ${label}`);
  return {
    id,
    name: dynamicValueNameFor({ kind: 'condition', conditionId: id }),
  };
};

const place = (
  id: string,
  attributes: NcNode[typeof entityAttributesProperty],
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: attributes,
  type: PLACE,
});

const edge = (id: string, from: string, to: string, type = NEAR): NcEdge => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type,
  from,
  to,
});

type Localization = InterviewPayload['protocol']['localization'];

const ENGLISH: Localization = {
  defaultLocale: 'en',
  locales: ['en'],
};

function storeWith(
  dynamicLabel: NodeLabel | undefined,
  nodes: NcNode[],
  edges: NcEdge[] = [],
  localization: Localization = ENGLISH,
) {
  const codebook: Codebook = {
    node: {
      [PLACE]: {
        name: 'Place',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [NAME_VAR]: { name: 'name', type: 'text' },
          [KIND]: {
            name: 'kind',
            type: 'ordinal',
            options: [
              { id: HOSPITAL, label: { en: 'Hospital' }, value: 'hospital' },
              { id: SCHOOL, label: { en: 'School' }, value: 'school' },
            ],
          },
          [BEDS]: { name: 'beds', type: 'number' },
        },
        ...(dynamicLabel && { dynamicLabel }),
      },
    },
    edge: {
      [NEAR]: { name: 'Near', color: 'edge-color-seq-1' },
      [FAR]: { name: 'Far', color: 'edge-color-seq-2' },
    },
  };
  const payload: InterviewPayload = {
    session: {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localeOptions: localization.locales.map((tag) => getLocaleMetadata(tag)),
      network: { ...createInitialNetwork(), nodes, edges },
    },
    protocol: {
      id: 'protocol-1',
      hash: 'hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Labels',
      schemaVersion: 9,
      localization,
      assets: [],
      codebook,
      stages: [
        {
          id: testId('stage-1'),
          type: 'NameGenerator',
          label: { en: 'Name generator' },
          subject: { entity: 'node', types: [PLACE] },
          form: {
            title: { en: 'Add a place' },
            fields: [
              {
                id: testId('field-L114'),
                variable: asEntityAttributeReference(NAME_VAR),
                prompt: { en: 'Name' },
              },
            ],
          },
          prompts: [{ id: testId('prompt-1'), text: { en: 'Name a place' } }],
        },
      ],
    },
  };
  return createStore(payload, { onSync: () => Promise.resolve() });
}

type TestStore = ReturnType<typeof storeWith>;

const wrapperFor =
  (
    store: TestStore,
    localization: Localization = ENGLISH,
    locale: string | null = null,
  ) =>
  ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <TestProtocolLocalization localization={localization} locale={locale}>
        {children}
      </TestProtocolLocalization>
    </Provider>
  );

function renderLabel(store: TestStore, node: NcNode) {
  let renders = 0;
  const rendered = renderHook(
    () => {
      renders += 1;
      return useNodeLabel(node);
    },
    { wrapper: wrapperFor(store) },
  );
  return { ...rendered, renders: () => renders };
}

const SWITCH_LABEL: NodeLabel = {
  text: {
    en: `{${NAMES.kind}, select, missing {} ${HOSPITAL_CASE} {🏥 } ${SCHOOL_CASE} {🏫 } other {}}{${NAMES.label}}`,
  },
};

describe('a node type’s own label', () => {
  it('leaves a node with the label the interview chooses when its type has none', () => {
    const node = place('a', { [NAME_VAR]: 'St Mary’s' });
    const { result } = renderLabel(storeWith(undefined, [node]), node);
    expect(result.current).toBe('St Mary’s');
  });

  it('chooses a version by an attribute and shows the default label', () => {
    const hospital = place('a', {
      [NAME_VAR]: 'St Mary’s',
      [KIND]: 'hospital',
    });
    const school = place('b', { [NAME_VAR]: 'Hill Road', [KIND]: 'school' });
    const unknown = place('c', { [NAME_VAR]: 'Somewhere' });
    const store = storeWith(SWITCH_LABEL, [hospital, school, unknown]);
    expect(renderLabel(store, hospital).result.current).toBe('🏥 St Mary’s');
    expect(renderLabel(store, school).result.current).toBe('🏫 Hill Road');
    expect(renderLabel(store, unknown).result.current).toBe('Somewhere');
  });

  it('follows the node’s answers as they change', () => {
    const store = storeWith(SWITCH_LABEL, []);
    const { result, rerender } = renderHook(
      ({ node }: { node: NcNode }) => useNodeLabel(node),
      {
        wrapper: wrapperFor(store),
        initialProps: {
          node: place('a', { [NAME_VAR]: 'A', [KIND]: 'school' }),
        },
      },
    );
    expect(result.current).toBe('🏫 A');
    rerender({ node: place('a', { [NAME_VAR]: 'A', [KIND]: 'hospital' }) });
    expect(result.current).toBe('🏥 A');
  });

  it('shows the default label when its own text comes out empty', () => {
    const node = place('a', {});
    const store = storeWith(
      {
        text: {
          en: `{${NAMES.name}, select, missing {} other {{${NAMES.name}}}}`,
        },
      },
      [node],
    );
    expect(renderLabel(store, node).result.current).toBe('Unnamed');
  });

  it('nests a version inside another', () => {
    const label: NodeLabel = {
      text: {
        en: `{${NAMES.kind}, select, missing {} ${HOSPITAL_CASE} {{${NAMES.beds}, select, missing {🏥} other {{${NAMES.beds}, plural, one {🏥 # bed} other {🏥 # beds}}}}} other {}} {${NAMES.label}}`,
      },
    };
    const big = place('a', {
      [NAME_VAR]: 'A',
      [KIND]: 'hospital',
      [BEDS]: 1200,
    });
    const one = place('b', { [NAME_VAR]: 'B', [KIND]: 'hospital', [BEDS]: 1 });
    const none = place('c', { [NAME_VAR]: 'C', [KIND]: 'hospital' });
    const school = place('d', { [NAME_VAR]: 'D', [KIND]: 'school', [BEDS]: 5 });
    const store = storeWith(label, [big, one, none, school]);
    expect(renderLabel(store, big).result.current).toBe('🏥 1,200 beds A');
    expect(renderLabel(store, one).result.current).toBe('🏥 1 bed B');
    expect(renderLabel(store, none).result.current).toBe('🏥 C');
    expect(renderLabel(store, school).result.current).toBe('D');
  });

  it('chooses a version by a condition’s rules, met or not', () => {
    const large = conditionNamed('large');
    const label: NodeLabel = NodeLabelSchema.parse({
      text: {
        en: `{${large.name}, select, true {⭐ } other {}}{${large.name}, select, false {· } other {}}{${NAMES.label}}`,
      },
      conditions: {
        [large.id]: {
          about: 'node',
          join: 'AND',
          rules: [
            {
              type: 'node',
              id: testId('r1'),
              options: {
                type: PLACE,
                attribute: KIND,
                operator: 'EXACTLY',
                value: 'hospital',
              },
            },
            {
              type: 'node',
              id: testId('r2'),
              options: {
                type: PLACE,
                attribute: BEDS,
                operator: 'GREATER_THAN',
                value: 100,
              },
            },
          ],
        },
      },
    });
    const big = place('a', {
      [NAME_VAR]: 'A',
      [KIND]: 'hospital',
      [BEDS]: 400,
    });
    const small = place('b', {
      [NAME_VAR]: 'B',
      [KIND]: 'hospital',
      [BEDS]: 40,
    });
    const store = storeWith(label, [big, small]);
    expect(renderLabel(store, big).result.current).toBe('⭐ A');
    expect(renderLabel(store, small).result.current).toBe('· B');
  });

  it('reads the translation in the participant’s language', () => {
    const localization: Localization = {
      defaultLocale: 'en',
      locales: ['en', 'es'],
    };
    const node = place('a', { [NAME_VAR]: 'A' });
    const store = storeWith(
      {
        text: {
          en: `Place {${NAMES.label}}`,
          es: `Lugar {${NAMES.label}}`,
        },
      },
      [node],
      [],
      localization,
    );
    const { result } = renderHook(() => useNodeLabel(node), {
      wrapper: wrapperFor(store, localization, 'es'),
    });
    expect(result.current).toBe('Lugar A');
  });
});

describe('a label that follows how its node is connected', () => {
  const edgeRule = (id: string, options: Record<string, unknown>) => ({
    about: 'node',
    rules: [{ type: 'edge', id: testId(id), options }],
  });
  const linked = conditionNamed('linked');
  const near = conditionNamed('near');
  const most = conditionNamed('most');
  const least = conditionNamed('least');
  const label: NodeLabel = NodeLabelSchema.parse({
    text: {
      en: `{${linked.name}, select, true {🔗 } other {}}{${near.name}, select, true {📍 } other {}}{${most.name}, select, true {👑 } other {}}{${least.name}, select, true {🌱 } other {}}{${NAMES.label}}`,
    },
    conditions: {
      [linked.id]: edgeRule('r1', { count: 'GREATER_THAN', value: 0 }),
      [near.id]: edgeRule('r2', { type: NEAR, operator: 'EXISTS' }),
      [most.id]: edgeRule('r3', { count: 'MOST' }),
      [least.id]: edgeRule('r4', { count: 'FEWEST' }),
    },
  });
  const a = place('a', { [NAME_VAR]: 'A' });
  const b = place('b', { [NAME_VAR]: 'B' });
  const c = place('c', { [NAME_VAR]: 'C' });
  const d = place('d', { [NAME_VAR]: 'D' });

  it('marks no node out when none is connected', () => {
    const store = storeWith(label, [a, b, c]);
    expect(renderLabel(store, a).result.current).toBe('A');
  });

  it('shows whether it has any edge, an edge of one type, and the most or fewest', () => {
    const store = storeWith(
      label,
      [a, b, c, d],
      [edge('1', 'a', 'b', FAR), edge('2', 'a', 'c', NEAR)],
    );
    expect(renderLabel(store, a).result.current).toBe('🔗 📍 👑 A');
    expect(renderLabel(store, b).result.current).toBe('🔗 B');
    expect(renderLabel(store, c).result.current).toBe('🔗 📍 C');
    expect(renderLabel(store, d).result.current).toBe('🌱 D');
  });

  it('follows an edge added to the node, and is not redrawn for one added elsewhere', async () => {
    const store = storeWith(label, [a, b, c, d], [edge('1', 'a', 'b', FAR)]);
    const labelOfC = renderLabel(store, c);
    const labelOfA = renderLabel(store, a);
    expect(labelOfC.result.current).toBe('🌱 C');
    expect(labelOfA.result.current).toBe('🔗 👑 A');
    const rendersOfA = labelOfA.renders();

    // An edge between two other nodes leaves A as it was: connected, and
    // still among those with the most.
    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'c', to: 'd', type: NEAR, currentStep: 0 }),
      );
    });
    expect(labelOfC.result.current).toBe('🔗 📍 C');
    expect(labelOfA.result.current).toBe('🔗 A');

    // A is no longer alone at the top, so its label did change above. An
    // edge that changes nothing A's label reads does not redraw it.
    const afterFirst = labelOfA.renders();
    expect(afterFirst).toBeGreaterThan(rendersOfA);
    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'c', to: 'd', type: FAR, currentStep: 0 }),
      );
    });
    expect(labelOfA.result.current).toBe('🔗 🌱 A');
  });

  it('does not redraw a node whose facts an edge elsewhere leaves alone', async () => {
    const onlyLinked: NodeLabel = NodeLabelSchema.parse({
      text: {
        en: `{${linked.name}, select, true {🔗 } other {}}{${NAMES.label}}`,
      },
      conditions: {
        [linked.id]: edgeRule('r1', {
          count: 'GREATER_THAN_OR_EQUAL',
          value: 1,
        }),
      },
    });
    const store = storeWith(onlyLinked, [a, b, c, d]);
    const labelOfA = renderLabel(store, a);
    const before = labelOfA.renders();
    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'c', to: 'd', type: NEAR, currentStep: 0 }),
      );
    });
    expect(labelOfA.result.current).toBe('A');
    expect(labelOfA.renders()).toBe(before);

    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'a', to: 'd', type: NEAR, currentStep: 0 }),
      );
    });
    expect(labelOfA.result.current).toBe('🔗 A');
  });

  it('gives the same labels to something that labels many nodes at once', () => {
    const store = storeWith(
      label,
      [a, b, c, d],
      [edge('1', 'a', 'b', FAR), edge('2', 'a', 'c', NEAR)],
    );
    const { result } = renderHook(() => useNodeLabeller(() => undefined), {
      wrapper: wrapperFor(store),
    });
    expect([a, b, c, d].map((node) => result.current(node))).toEqual([
      '🔗 📍 👑 A',
      '🔗 B',
      '🔗 📍 C',
      '🌱 D',
    ]);
  });
});
