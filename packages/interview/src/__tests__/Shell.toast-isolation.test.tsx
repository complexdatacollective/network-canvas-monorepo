import { Toast } from '@base-ui/react/toast';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useRef } from 'react';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppMessage } from '@codaco/app-i18n/react';
import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload, SyncHandler } from '../contract/types';
import useStageValidation from '../hooks/useStageValidation';
import { runtimeMessages } from '../i18n/runtimeMessages';
import Shell from '../Shell';
import {
  InterviewToastProvider,
  InterviewToastViewport,
} from '../toast/InterviewToast';
import { interviewToastManager } from '../toast/interviewToastManager';

// Keep the actual NameGenerator, node-limit validation, Navigation, Shell,
// Redux store, toast providers and toast UI. Avoid importing unrelated WebGL
// stages into jsdom; no validation or toast behavior is mocked.
vi.mock('../interfaces', async () => {
  const { default: NameGenerator } =
    await import('../interfaces/NameGenerator/NameGenerator');
  return { default: () => NameGenerator };
});

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Match the existing StagesMenu unit harness: search indexing is outside this
// validation test, while empty collections and the real answer store remain live.
class StubWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

const originalElementsFromPoint = Object.getOwnPropertyDescriptor(
  document,
  'elementsFromPoint',
);

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('IntersectionObserver', ResizeObserverStub);
  vi.stubGlobal('Worker', StubWorker);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  // jsdom has no layout hit-testing. The production keyboard drag path pins
  // the compatible target explicitly after this pointer-only lookup.
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [],
  });
});
afterAll(() => {
  if (originalElementsFromPoint) {
    Object.defineProperty(
      document,
      'elementsFromPoint',
      originalElementsFromPoint,
    );
  } else {
    Reflect.deleteProperty(document, 'elementsFromPoint');
  }
});
beforeEach(() => {
  document.documentElement.lang = 'en-GB';
  document.documentElement.dir = 'ltr';
});

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

function makePayload(id: string): InterviewPayload {
  return {
    session: {
      id: `${id}-session`,
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      network: {
        ego: {
          [entityPrimaryKeyProperty]: `${id}-ego`,
          [entityAttributesProperty]: { original: 'Authored_Á1' },
        },
        nodes: [],
        edges: [],
      },
    },
    protocol: {
      id: `${id}-protocol`,
      hash: `${id}-hash`,
      importedAt: '2026-01-01T00:00:00.000Z',
      name: `Authored_${id}`,
      schemaVersion: 8,
      codebook: {
        ego: { variables: {} },
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            icon: 'add-a-person',
            variables: { name: { name: 'Name', type: 'text' } },
          },
        },
        edge: {},
      },
      assets: [],
      stages: [
        {
          id: `${id}-names`,
          type: 'NameGeneratorQuickAdd',
          label: `Original_${id}`,
          subject: { entity: 'node', type: 'person' },
          quickAdd: asEntityAttributeReference('name'),
          prompts: [{ id: `${id}-prompt`, text: `Original prompt ${id}` }],
          behaviours: { minNodes: 1 },
        },
      ],
    },
  };
}

const handlers = {
  onFinish: () => Promise.resolve(),
  onRequestAsset: () => Promise.resolve(''),
  analytics: { installationId: 'test', hostApp: 'test' },
};

function currentStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('Actual Shell did not expose its E2E store');
  return store;
}

function StandaloneToast() {
  const { showToast, closeToast } = useStageValidation({ constraints: [] });
  const id = useRef<string | null>(null);
  return (
    <>
      <button
        onClick={() => {
          id.current = showToast({
            description: <AppMessage message={runtimeMessages.taskComplete} />,
            variant: 'success',
            anchor: 'forward',
            timeout: 0,
          });
        }}
      >
        Show standalone notification
      </button>
      <button
        onClick={() => {
          if (!id.current) throw new Error('No standalone toast was queued');
          closeToast(id.current);
        }}
      >
        Close standalone notification
      </button>
    </>
  );
}

function ScopedToast({
  manager,
}: {
  manager: ReturnType<typeof Toast.createToastManager>;
}) {
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <InterviewToastProvider
      toastManager={manager}
      forwardButtonRef={forwardButtonRef}
      backButtonRef={backButtonRef}
      orientation="horizontal"
    >
      <Toast.Provider toastManager={manager}>
        <StandaloneToast />
        <button>Return to answer</button>
        <InterviewToastViewport />
      </Toast.Provider>
    </InterviewToastProvider>
  );
}

describe('Shell toast ownership', () => {
  it('keeps actual validation and queued language changes inside one Shell without writing answers', async () => {
    const firstPayload = makePayload('first');
    const secondPayload = makePayload('second');
    const originalFirst = structuredClone(firstPayload);
    const originalSecond = structuredClone(secondPayload);
    const firstSync = vi.fn<SyncHandler>(() => Promise.resolve());
    const secondSync = vi.fn<SyncHandler>(() => Promise.resolve());
    const firstContent = (requestedLocale: string) => (
      <section data-testid="first-shell">
        <Shell
          {...handlers}
          payload={firstPayload}
          onSync={firstSync}
          requestedLocale={requestedLocale}
          flags={{ isE2E: true }}
          disableAnalytics
        />
      </section>
    );
    const firstView = render(firstContent('en'), { wrapper: WithoutMotion });
    const first = screen.getByTestId('first-shell');
    await within(first).findByRole('button', { name: 'Next Step' });
    const firstStore = currentStore();
    render(
      <section data-testid="second-shell">
        <Shell
          {...handlers}
          payload={secondPayload}
          onSync={secondSync}
          requestedLocale="es"
          flags={{ isE2E: true }}
          disableAnalytics
        />
      </section>,
      { wrapper: WithoutMotion },
    );
    const second = screen.getByTestId('second-shell');
    await within(second).findByRole('button', { name: 'Siguiente paso' });
    const secondStore = currentStore();
    expect(firstStore).not.toBe(secondStore);
    expect(
      within(first).getAllByRole('region', { name: 'Interview notifications' }),
    ).toHaveLength(1);
    expect(
      within(second).getAllByRole('region', {
        name: 'Notificaciones de la entrevista',
      }),
    ).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(within(first).getByTestId('quick-add-toggle'));
    const input = await within(first).findByRole('textbox', {
      name: 'Person name',
    });
    await user.type(input, 'Álvaro & <first>');
    const beforeFirst = structuredClone(firstStore.getState().session);
    const beforeSecond = structuredClone(secondStore.getState().session);
    firstSync.mockClear();
    secondSync.mockClear();

    // Change language while the real answer field is still focused. Leaving
    // Quick Add intentionally clears its draft, so inspect the live input
    // before the later navigation click exercises that separate behavior.
    firstView.rerender(firstContent('es-MX'));
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(within(first).getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Álvaro & <first>');
    expect(firstStore.getState().session).toEqual(beforeFirst);
    expect(secondStore.getState().session).toEqual(beforeSecond);
    expect(firstSync).not.toHaveBeenCalled();
    expect(secondSync).not.toHaveBeenCalled();
    firstView.rerender(firstContent('en'));
    expect(within(first).getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Álvaro & <first>');

    await user.click(within(first).getByRole('button', { name: 'Next Step' }));
    const notification = await within(first).findByRole('dialog');
    expect(notification).toHaveTextContent(
      'You must create at least 1 item before you can continue.',
    );
    expect(within(second).queryByRole('dialog')).not.toBeInTheDocument();
    expect(firstStore.getState().session).toEqual(beforeFirst);
    expect(secondStore.getState().session).toEqual(beforeSecond);
    expect(firstSync).not.toHaveBeenCalled();
    expect(secondSync).not.toHaveBeenCalled();

    firstView.rerender(firstContent('es-MX'));
    expect(within(first).getByRole('dialog')).toBe(notification);
    expect(notification).toHaveTextContent(
      'Debes crear al menos 1 elemento antes de continuar.',
    );
    expect(notification.closest('[lang]')).toHaveAttribute('lang', 'es');
    expect(
      within(first).getAllByRole('region', {
        name: 'Notificaciones de la entrevista',
      }),
    ).toHaveLength(1);
    expect(within(second).queryByRole('dialog')).not.toBeInTheDocument();
    expect(firstStore.getState().session).toEqual(beforeFirst);
    expect(secondStore.getState().session).toEqual(beforeSecond);
    expect(firstSync).not.toHaveBeenCalled();
    expect(secondSync).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe('en-GB');
    expect(firstPayload).toEqual(originalFirst);
    expect(secondPayload).toEqual(originalSecond);

    // Move through a control inside the actual toast before reopening Quick
    // Add, so the toast's focus/blur close path is positively exercised.
    const closeButton = within(notification).getByRole('button', {
      name: 'Cerrar',
    });
    act(() => closeButton.focus());
    expect(closeButton).toHaveFocus();
    await user.click(within(first).getByTestId('quick-add-toggle'));
    await waitFor(() =>
      expect(within(first).queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(within(second).queryByRole('dialog')).not.toBeInTheDocument();

    // Positive control: the same real form and sync handlers can save an
    // answer. The earlier no-write checks therefore cannot pass on an inert
    // probe, an unmounted stage, or a disconnected store/handler.
    const newInput = await within(first).findByRole('textbox');
    await user.type(newInput, 'Álvaro & <first>{Enter}');
    await waitFor(() =>
      expect(firstStore.getState().session.network.nodes).toHaveLength(1),
    );
    expect(
      firstStore.getState().session.network.nodes[0]?.[
        entityAttributesProperty
      ],
    ).toMatchObject({ name: 'Álvaro & <first>' });
    await waitFor(() => expect(firstSync).toHaveBeenCalled());
    expect(secondStore.getState().session).toEqual(beforeSecond);
    expect(secondSync).not.toHaveBeenCalled();
  });

  it('retains provider-optional English and the module-manager fallback for standalone controls', async () => {
    render(
      <Toast.Provider toastManager={interviewToastManager}>
        <StandaloneToast />
        <InterviewToastViewport />
      </Toast.Provider>,
      { wrapper: WithoutMotion },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Show standalone notification' }),
    );
    const notification = await screen.findByRole('dialog');
    expect(notification).toHaveTextContent(
      'You have completed this task. Click the next arrow to continue.',
    );
    expect(
      screen.getAllByRole('region', { name: 'Interview notifications' }),
    ).toHaveLength(1);
    await act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Close standalone notification' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('dismisses a persistent notification through its rendering manager when focus leaves it', async () => {
    const manager = Toast.createToastManager();
    render(<ScopedToast manager={manager} />, { wrapper: WithoutMotion });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Show standalone notification' }),
    );
    const notification = await screen.findByRole('dialog');
    expect(notification).toHaveTextContent(
      'You have completed this task. Click the next arrow to continue.',
    );
    const closeButton = within(notification).getByRole('button', {
      name: 'Close',
    });
    act(() => closeButton.focus());
    expect(closeButton).toHaveFocus();
    // This control emits no manager command. The actual toast blur handler
    // must dismiss it; timeout: 0 prevents expiry from satisfying the oracle.
    await user.click(screen.getByRole('button', { name: 'Return to answer' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

describe('Shell stage portal ownership', () => {
  it('keeps each actual NameGenerator bin in its own language region and deletes only its own same-ID node', async () => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    const firstPayload = makePayload('first');
    const secondPayload = makePayload('second');
    firstPayload.session.network.nodes = [
      {
        [entityPrimaryKeyProperty]: 'same-node-id',
        type: 'person',
        [entityAttributesProperty]: { name: 'Álvaro first' },
        promptIDs: ['first-prompt'],
      },
    ];
    secondPayload.session.network.nodes = [
      {
        [entityPrimaryKeyProperty]: 'same-node-id',
        type: 'person',
        [entityAttributesProperty]: { name: 'Íñigo second' },
        promptIDs: ['second-prompt'],
      },
    ];
    const originalFirst = structuredClone(firstPayload);
    const originalSecond = structuredClone(secondPayload);
    const firstSync = vi.fn<SyncHandler>(() => Promise.resolve());
    const secondSync = vi.fn<SyncHandler>(() => Promise.resolve());
    render(
      <section data-testid="first-shell">
        <Shell
          {...handlers}
          payload={firstPayload}
          onSync={firstSync}
          requestedLocale="en"
          flags={{ isE2E: true }}
          disableAnalytics
        />
      </section>,
      { wrapper: WithoutMotion },
    );
    const first = screen.getByTestId('first-shell');
    const firstNode = await within(first).findByRole('option', {
      name: 'Álvaro first',
    });
    const firstStore = currentStore();
    const secondContent = (requestedLocale: string) => (
      <section data-testid="second-shell">
        <Shell
          {...handlers}
          payload={secondPayload}
          onSync={secondSync}
          requestedLocale={requestedLocale}
          flags={{ isE2E: true }}
          disableAnalytics
        />
      </section>
    );
    const secondView = render(secondContent('es'), { wrapper: WithoutMotion });
    const second = screen.getByTestId('second-shell');
    const secondNode = await within(second).findByRole('option', {
      name: 'Íñigo second',
    });
    const secondStore = currentStore();
    expect(firstStore).not.toBe(secondStore);
    expect(within(first).getAllByLabelText('Delete bin')).toHaveLength(1);
    expect(within(second).getAllByLabelText('Papelera')).toHaveLength(1);
    const firstBin = within(first).getByLabelText('Delete bin');
    const secondBin = within(second).getByLabelText('Papelera');
    expect(first).toContainElement(firstBin);
    expect(first).not.toContainElement(secondBin);
    expect(second).toContainElement(secondBin);
    expect(secondBin.closest('[lang]')).toHaveAttribute('lang', 'es');
    expect(secondBin.closest('[dir]')).toHaveAttribute('dir', 'ltr');

    const beforeFirst = structuredClone(firstStore.getState().session);
    const beforeSecond = structuredClone(secondStore.getState().session);
    firstSync.mockClear();
    secondSync.mockClear();
    secondView.rerender(secondContent('en-GB'));
    expect(within(second).getByLabelText('Delete bin')).toBe(secondBin);
    expect(secondBin.closest('[lang]')).toHaveAttribute('lang', 'en-GB');
    expect(secondBin.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    expect(firstBin.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(firstStore.getState().session).toEqual(beforeFirst);
    expect(secondStore.getState().session).toEqual(beforeSecond);
    expect(firstSync).not.toHaveBeenCalled();
    expect(secondSync).not.toHaveBeenCalled();

    // Use the production keyboard drag path, including the real Collection,
    // DnD stores, NodeBin accepts/drop handlers, Redux reducers and host sync.
    // The duplicate node ID makes a handler bound to the wrong store observable.
    const user = userEvent.setup();
    act(() => secondNode.focus());
    await user.keyboard('{Control>}d{/Control}');
    expect(secondNode).toHaveAttribute('aria-grabbed', 'true');
    expect(secondBin).toHaveAttribute('aria-dropeffect', 'move');
    expect(firstBin).toHaveAttribute('aria-dropeffect', 'none');
    await user.keyboard('{ArrowRight}{Enter}');
    await waitFor(() =>
      expect(secondStore.getState().session.network.nodes).toHaveLength(0),
    );
    await waitFor(() => expect(secondSync).toHaveBeenCalled());
    expect(firstStore.getState().session).toEqual(beforeFirst);
    expect(firstSync).not.toHaveBeenCalled();
    expect(within(first).getByRole('option', { name: 'Álvaro first' })).toBe(
      firstNode,
    );
    expect(
      within(second).queryByRole('option', { name: 'Íñigo second' }),
    ).not.toBeInTheDocument();

    // Positive control for the other Shell: its own bin remains operational.
    secondSync.mockClear();
    const afterSecond = structuredClone(secondStore.getState().session);
    act(() => firstNode.focus());
    await user.keyboard('{Control>}d{/Control}{ArrowRight}{Enter}');
    await waitFor(() =>
      expect(firstStore.getState().session.network.nodes).toHaveLength(0),
    );
    await waitFor(() => expect(firstSync).toHaveBeenCalled());
    expect(secondStore.getState().session).toEqual(afterSecond);
    expect(secondSync).not.toHaveBeenCalled();
    expect(firstPayload).toEqual(originalFirst);
    expect(secondPayload).toEqual(originalSecond);
  });
});
