import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import type { OutcomeOf } from '../../interfaces/Anonymisation/decryptionScope';
import {
  useNodeLabel,
  useNodeLabeller,
} from '../../interfaces/Anonymisation/useNodeLabel';
import { restoreNode } from '../../store/modules/session';
import { NodeLabelWorkerProvider } from '../NodeLabelWorkerProvider';

vi.mock('../createNodeLabelWorker.ts', async () => {
  const { createInProcessNodeLabelWorker } = await import('./inProcessWorker');
  return { createNodeLabelWorker: createInProcessNodeLabelWorker };
});

const plainVariables = {
  name: { name: 'name', type: 'text', component: 'Text' },
  age: { name: 'age', type: 'number', component: 'Number' },
} as const;

const person = (id: string, name: string, age = 30): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: NODE_TYPE,
  [entityAttributesProperty]: { name, age },
});

const COUNTING_WORKER = `
  function nodeLabelWorker({ node, network }) {
    return node.name + ' (' + node.age + ') of ' + network.nodes.length;
  }
`;

type Store = ReturnType<typeof createEncryptionStore>;

const wrapperFor =
  (store: Store) =>
  ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <TestProtocolLocalization>
        <NodeLabelWorkerProvider>{children}</NodeLabelWorkerProvider>
      </TestProtocolLocalization>
    </Provider>
  );

function renderLabel(store: Store, node: NcNode) {
  const seen: (string | undefined)[] = [];
  const rendered = renderHook(
    () => {
      const label = useNodeLabel(node);
      seen.push(label);
      return label;
    },
    { wrapper: wrapperFor(store) },
  );
  return { ...rendered, seen };
}

const noOutcome: OutcomeOf = () => undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useNodeLabel with a node label worker', () => {
  it('shows the standard label first, then the worker label', async () => {
    const ada = person('a', 'Ada');
    const store = createEncryptionStore([ada], undefined, plainVariables, {
      nodeLabelWorker: COUNTING_WORKER,
    });

    const { result, seen } = renderLabel(store, ada);

    expect(seen[0]).toBe('Ada');
    await waitFor(() => expect(result.current).toBe('Ada (30) of 1'));
  });

  it('labels again when the network changes', async () => {
    const ada = person('a', 'Ada');
    const store = createEncryptionStore([ada], undefined, plainVariables, {
      nodeLabelWorker: COUNTING_WORKER,
    });
    const { result, seen } = renderLabel(store, ada);
    await waitFor(() => expect(result.current).toBe('Ada (30) of 1'));

    const before = seen.length;
    act(() => {
      store.dispatch(restoreNode(person('b', 'Bo')));
    });

    await waitFor(() => expect(result.current).toBe('Ada (30) of 2'));
    // Never back to the standard label while the new one is worked out.
    expect(seen.slice(before)).not.toContain('Ada');
  });

  it('labels a node that is not in the network', async () => {
    const store = createEncryptionStore([], undefined, plainVariables, {
      nodeLabelWorker: COUNTING_WORKER,
    });

    const { result } = renderLabel(store, person('x', 'Xi', 41));

    await waitFor(() => expect(result.current).toBe('Xi (41) of 0'));
  });

  it('keeps the standard label when there is no worker', async () => {
    const ada = person('a', 'Ada');
    const store = createEncryptionStore([ada], undefined, plainVariables);

    const { result } = renderLabel(store, ada);
    await settle();

    expect(result.current).toBe('Ada');
  });

  it('keeps the standard label for a node the worker gives no label', async () => {
    const ada = person('a', 'Ada');
    const store = createEncryptionStore([ada], undefined, plainVariables, {
      nodeLabelWorker: `function nodeLabelWorker({ node }) {
        if (node.name === 'Ada') throw new Error('No');
        return 'Worker ' + node.name;
      }`,
    });

    const bo = person('b', 'Bo');

    const { result } = renderHook(
      () => ({ ada: useNodeLabel(ada), bo: useNodeLabel(bo) }),
      { wrapper: wrapperFor(store) },
    );

    await waitFor(() => expect(result.current.bo).toBe('Worker Bo'));
    expect(result.current.ada).toBe('Ada');
  });

  it('keeps standard labels when the worker cannot be used', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ada = person('a', 'Ada');
    const store = createEncryptionStore([ada], undefined, plainVariables, {
      nodeLabelWorker: 'function nodeLabelWorker( {',
    });

    const { result } = renderLabel(store, ada);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(result.current).toBe('Ada');
  });

  it('never hands an encrypted label to the worker', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node], undefined, undefined, {
      nodeLabelWorker: `function nodeLabelWorker({ node }) {
        return 'Worker saw ' + JSON.stringify(node);
      }`,
    });
    await unlockWith(store, 'pw');

    const { result, seen } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('Alice'));
    await settle();

    expect(result.current).toBe('Alice');
    expect(seen.some((label) => label?.startsWith('Worker'))).toBe(false);
  });
});

describe('useNodeLabeller with a node label worker', () => {
  it('gives the worker label, and a new function when it arrives', async () => {
    const ada = person('a', 'Ada');
    const store = createEncryptionStore([ada], undefined, plainVariables, {
      nodeLabelWorker: COUNTING_WORKER,
    });

    const { result } = renderHook(() => useNodeLabeller(noOutcome), {
      wrapper: wrapperFor(store),
    });
    const first = result.current;
    expect(first(ada)).toBe('Ada');

    await waitFor(() => expect(result.current(ada)).toBe('Ada (30) of 1'));
    expect(result.current).not.toBe(first);
  });
});
