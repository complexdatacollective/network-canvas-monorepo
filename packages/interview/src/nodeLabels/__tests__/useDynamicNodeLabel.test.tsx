import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Codebook,
  getLocaleMetadata,
  type NodeLabel,
  NodeLabelSchema,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { createInitialNetwork } from '../../contract/network';
import type { InterviewPayload } from '../../contract/types';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  useNodeLabel,
  useNodeLabeller,
} from '../../interfaces/Anonymisation/useNodeLabel';
import { addEdge } from '../../store/modules/session';
import { store as createStore } from '../../store/store';

const place = (
  id: string,
  attributes: NcNode[typeof entityAttributesProperty],
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: attributes,
  type: 'place',
});

const edge = (id: string, from: string, to: string, type = 'near'): NcEdge => ({
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
      place: {
        name: 'Place',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          nameVar: { name: 'name', type: 'text' },
          kind: {
            name: 'kind',
            type: 'ordinal',
            options: [
              { label: { en: 'Hospital' }, value: 'hospital' },
              { label: { en: 'School' }, value: 'school' },
            ],
          },
          beds: { name: 'beds', type: 'number' },
        },
        ...(dynamicLabel && { dynamicLabel }),
      },
    },
    edge: {
      near: { name: 'Near', color: 'edge-color-seq-1' },
      far: { name: 'Far', color: 'edge-color-seq-2' },
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
          id: 'stage-1',
          type: 'NameGenerator',
          label: { en: 'Name generator' },
          subject: { entity: 'node', type: 'place' },
          form: {
            title: { en: 'Add a place' },
            fields: [
              {
                variable: asEntityAttributeReference('nameVar'),
                prompt: { en: 'Name' },
              },
            ],
          },
          prompts: [{ id: 'prompt-1', text: { en: 'Name a place' } }],
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
    en: '{kind, select, missing {} hospital {🏥 } school {🏫 } other {}}{nodeLabel}',
  },
  dynamicValues: {
    kind: {
      path: 'node.kind',
      cases: { hospital: 'hospital', school: 'school' },
    },
    nodeLabel: { path: 'node.$label' },
  },
};

describe('a node type’s own label', () => {
  it('leaves a node with the label the interview chooses when its type has none', () => {
    const node = place('a', { nameVar: 'St Mary’s' });
    const { result } = renderLabel(storeWith(undefined, [node]), node);
    expect(result.current).toBe('St Mary’s');
  });

  it('chooses a version by an attribute and shows the default label', () => {
    const hospital = place('a', { nameVar: 'St Mary’s', kind: 'hospital' });
    const school = place('b', { nameVar: 'Hill Road', kind: 'school' });
    const unknown = place('c', { nameVar: 'Somewhere' });
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
        initialProps: { node: place('a', { nameVar: 'A', kind: 'school' }) },
      },
    );
    expect(result.current).toBe('🏫 A');
    rerender({ node: place('a', { nameVar: 'A', kind: 'hospital' }) });
    expect(result.current).toBe('🏥 A');
  });

  it('shows the default label when its own text comes out empty', () => {
    const node = place('a', {});
    const store = storeWith(
      {
        text: { en: '{name, select, missing {} other {{name}}}' },
        dynamicValues: { name: { path: 'node.nameVar' } },
      },
      [node],
    );
    expect(renderLabel(store, node).result.current).toBe('Unnamed');
  });

  it('nests a version inside another', () => {
    const label: NodeLabel = {
      text: {
        en: '{kind, select, missing {} hospital {{beds, select, missing {🏥} other {{beds, plural, one {🏥 # bed} other {🏥 # beds}}}}} other {}} {nodeLabel}',
      },
      dynamicValues: {
        kind: { path: 'node.kind', cases: { hospital: 'hospital' } },
        beds: { path: 'node.beds' },
        nodeLabel: { path: 'node.$label' },
      },
    };
    const big = place('a', { nameVar: 'A', kind: 'hospital', beds: 1200 });
    const one = place('b', { nameVar: 'B', kind: 'hospital', beds: 1 });
    const none = place('c', { nameVar: 'C', kind: 'hospital' });
    const school = place('d', { nameVar: 'D', kind: 'school', beds: 5 });
    const store = storeWith(label, [big, one, none, school]);
    expect(renderLabel(store, big).result.current).toBe('🏥 1,200 beds A');
    expect(renderLabel(store, one).result.current).toBe('🏥 1 bed B');
    expect(renderLabel(store, none).result.current).toBe('🏥 C');
    expect(renderLabel(store, school).result.current).toBe('D');
  });

  it('chooses a version by a condition’s rules', () => {
    const label: NodeLabel = NodeLabelSchema.parse({
      text: { en: '{large, select, yes {⭐ } other {}}{nodeLabel}' },
      dynamicValues: {
        large: { path: 'node.$condition.large', cases: { yes: true } },
        nodeLabel: { path: 'node.$label' },
      },
      conditions: {
        large: {
          name: 'Large hospital',
          filter: {
            join: 'AND',
            rules: [
              {
                type: 'node',
                id: 'r1',
                options: {
                  type: 'place',
                  attribute: 'kind',
                  operator: 'EXACTLY',
                  value: 'hospital',
                },
              },
              {
                type: 'node',
                id: 'r2',
                options: {
                  type: 'place',
                  attribute: 'beds',
                  operator: 'GREATER_THAN',
                  value: 100,
                },
              },
            ],
          },
        },
      },
    });
    const large = place('a', { nameVar: 'A', kind: 'hospital', beds: 400 });
    const small = place('b', { nameVar: 'B', kind: 'hospital', beds: 40 });
    const store = storeWith(label, [large, small]);
    expect(renderLabel(store, large).result.current).toBe('⭐ A');
    expect(renderLabel(store, small).result.current).toBe('B');
  });

  it('reads the translation in the participant’s language', () => {
    const localization: Localization = {
      defaultLocale: 'en',
      locales: ['en', 'es'],
    };
    const node = place('a', { nameVar: 'A' });
    const store = storeWith(
      {
        text: { en: 'Place {nodeLabel}', es: 'Lugar {nodeLabel}' },
        dynamicValues: { nodeLabel: { path: 'node.$label' } },
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
  const label: NodeLabel = {
    text: {
      en: '{linked, select, yes {🔗 } other {}}{near, select, yes {📍 } other {}}{most, select, yes {👑 } other {}}{least, select, yes {🌱 } other {}}{nodeLabel}',
    },
    dynamicValues: {
      linked: { path: 'node.$connected', cases: { yes: true } },
      near: { path: 'node.$connected.near', cases: { yes: true } },
      most: { path: 'node.$mostConnected', cases: { yes: true } },
      least: { path: 'node.$leastConnected', cases: { yes: true } },
      nodeLabel: { path: 'node.$label' },
    },
  };
  const a = place('a', { nameVar: 'A' });
  const b = place('b', { nameVar: 'B' });
  const c = place('c', { nameVar: 'C' });
  const d = place('d', { nameVar: 'D' });

  it('marks no node out when none is connected', () => {
    const store = storeWith(label, [a, b, c]);
    expect(renderLabel(store, a).result.current).toBe('A');
  });

  it('shows whether it has any edge, an edge of one type, and the most or fewest', () => {
    const store = storeWith(
      label,
      [a, b, c, d],
      [edge('1', 'a', 'b', 'far'), edge('2', 'a', 'c', 'near')],
    );
    expect(renderLabel(store, a).result.current).toBe('🔗 📍 👑 A');
    expect(renderLabel(store, b).result.current).toBe('🔗 B');
    expect(renderLabel(store, c).result.current).toBe('🔗 📍 C');
    expect(renderLabel(store, d).result.current).toBe('🌱 D');
  });

  it('follows an edge added to the node, and is not redrawn for one added elsewhere', async () => {
    const store = storeWith(label, [a, b, c, d], [edge('1', 'a', 'b', 'far')]);
    const labelOfC = renderLabel(store, c);
    const labelOfA = renderLabel(store, a);
    expect(labelOfC.result.current).toBe('🌱 C');
    expect(labelOfA.result.current).toBe('🔗 👑 A');
    const rendersOfA = labelOfA.renders();

    // An edge between two other nodes leaves A as it was: connected, and
    // still among those with the most.
    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'c', to: 'd', type: 'near', currentStep: 0 }),
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
        addEdge({ from: 'c', to: 'd', type: 'far', currentStep: 0 }),
      );
    });
    expect(labelOfA.result.current).toBe('🔗 🌱 A');
  });

  it('does not redraw a node whose facts an edge elsewhere leaves alone', async () => {
    const onlyLinked: NodeLabel = {
      text: { en: '{linked, select, yes {🔗 } other {}}{nodeLabel}' },
      dynamicValues: {
        linked: { path: 'node.$connected', cases: { yes: true } },
        nodeLabel: { path: 'node.$label' },
      },
    };
    const store = storeWith(onlyLinked, [a, b, c, d]);
    const labelOfA = renderLabel(store, a);
    const before = labelOfA.renders();
    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'c', to: 'd', type: 'near', currentStep: 0 }),
      );
    });
    expect(labelOfA.result.current).toBe('A');
    expect(labelOfA.renders()).toBe(before);

    await act(async () => {
      await store.dispatch(
        addEdge({ from: 'a', to: 'd', type: 'near', currentStep: 0 }),
      );
    });
    expect(labelOfA.result.current).toBe('🔗 A');
  });

  it('gives the same labels to something that labels many nodes at once', () => {
    const store = storeWith(
      label,
      [a, b, c, d],
      [edge('1', 'a', 'b', 'far'), edge('2', 'a', 'c', 'near')],
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
