import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { NodeLabelEvaluator } from '@codaco/interview/node-label-worker';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';
import { getNodeLabelWorker } from '~/selectors/protocol';

import NodeLabelWorkerSection from '../NodeLabelWorkerSection';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

// jsdom has no Web Worker. This stands in for the sandbox: a source containing
// BROKEN does not load, and any other labels every node "labelled".
vi.mock('@codaco/interview/node-label-worker', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@codaco/interview/node-label-worker')
    >();
  return {
    ...actual,
    createNodeLabelEvaluator: (source: string): NodeLabelEvaluator => {
      const failure = source.includes('BROKEN')
        ? new actual.NodeLabelWorkerError('compile', 'SyntaxError (line 1)')
        : undefined;
      const ready = failure ? Promise.reject(failure) : Promise.resolve();
      ready.catch(() => undefined);
      return {
        ready,
        label: ({ nodes }) =>
          failure
            ? Promise.reject(failure)
            : Promise.resolve(
                nodes.map(() => ({ ok: true, label: 'labelled' }) as const),
              ),
        dispose: () => undefined,
      };
    },
  };
});

const SOURCE = 'function nodeLabelWorker() { return "x"; }';

const makeStore = (nodeLabelWorker?: string) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const protocol = structuredClone(
    developmentProtocol,
  ) as unknown as CurrentProtocol;
  store.dispatch(
    protocolActions.setActiveProtocol(
      nodeLabelWorker ? { ...protocol, nodeLabelWorker } : protocol,
    ),
  );
  return store;
};

const renderSection = (store: ReturnType<typeof makeStore>, readOnly = false) =>
  render(
    <Provider store={store}>
      <ProtocolReadOnlyContext value={readOnly}>
        <DialogProvider>
          <NodeLabelWorkerSection />
        </DialogProvider>
      </ProtocolReadOnlyContext>
    </Provider>,
  );

const typeScript = (source: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: /^Script/ }), {
    target: { value: source },
  });
};

describe('NodeLabelWorkerSection', () => {
  it('saves the script written in the dialog to the protocol', async () => {
    const store = makeStore();
    renderSection(store);

    fireEvent.click(
      screen.getByRole('button', { name: 'Add node label worker' }),
    );
    // The dialog starts from a script that already works.
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: /^Script/ })
        .value,
    ).toContain('function nodeLabelWorker');

    typeScript(SOURCE);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(getNodeLabelWorker(store.getState())).toBe(SOURCE),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('does not save a script that cannot be loaded, and says why', async () => {
    const store = makeStore(SOURCE);
    renderSection(store);

    fireEvent.click(screen.getByRole('button', { name: 'Edit script' }));
    typeScript('BROKEN');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.getAllByText('This script cannot be used. SyntaxError (line 1)')
          .length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getNodeLabelWorker(store.getState())).toBe(SOURCE);
  });

  it('removes the script once the researcher confirms', async () => {
    const store = makeStore(SOURCE);
    renderSection(store);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(getNodeLabelWorker(store.getState())).toBe(SOURCE);

    const confirmation = within(await screen.findByRole('dialog'));
    fireEvent.click(confirmation.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(getNodeLabelWorker(store.getState())).toBeUndefined(),
    );
    expect(
      Object.hasOwn(
        store.getState().activeProtocol.present ?? {},
        'nodeLabelWorker',
      ),
    ).toBe(false);
  });

  it('offers no editing while another tab owns the protocol', () => {
    renderSection(makeStore(SOURCE), true);

    expect(screen.getByRole('button', { name: 'Edit script' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(screen.getByText(SOURCE)).toBeInTheDocument();
  });
});
