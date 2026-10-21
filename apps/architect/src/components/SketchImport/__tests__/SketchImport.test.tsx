import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolOpenResult } from '~/ducks/modules/userActions/userActions';

const SKETCH_ORIGIN = 'https://sketch.networkcanvas.com';

const { openSketchProtocol, unwrapResult, showDialog, setLocation } =
  vi.hoisted(() => ({
    openSketchProtocol: vi.fn((args: unknown) => ({
      type: 'openSketchProtocol',
      args,
    })),
    unwrapResult: vi.fn<() => Promise<ProtocolOpenResult>>(),
    showDialog: vi.fn(async () => undefined),
    setLocation: vi.fn(),
  }));

const dispatch = () => ({ unwrap: unwrapResult });

vi.mock('~/ducks/modules/userActions/userActions', () => ({
  openSketchProtocol,
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatch,
}));

vi.mock('~/components/protocolOpenDialogs', () => ({
  showProtocolOpenResultDialog: showDialog,
}));

vi.mock('wouter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wouter')>()),
  useLocation: () => ['/import-from-sketch', setLocation],
}));

import SketchImport, {
  PAYLOAD_TIMEOUT_MS,
  READY_INTERVAL_MS,
} from '../SketchImport';

const readyMessage = { type: 'sketch-import:ready', version: 1 };

const makeProtocol = () => ({
  name: 'From Sketch',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {
    roster: { type: 'network', name: 'Class roster', source: 'roster.csv' },
  },
});

const makePayload = (overrides: Record<string, unknown> = {}) => ({
  type: 'sketch-import:payload',
  version: 1,
  protocol: makeProtocol(),
  name: 'My study',
  assets: [
    {
      id: 'roster',
      name: 'roster.csv',
      data: new Blob(['name\nAda'], { type: 'text/csv' }),
    },
  ],
  ...overrides,
});

let openerStub: { postMessage: ReturnType<typeof vi.fn> };

function post(source: unknown, data: unknown, origin = SKETCH_ORIGIN) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: source as MessageEventSource,
        origin,
      }),
    );
  });
}

// Let the async import chain (unwrap → postMessage → dialog) settle.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const readyCalls = () =>
  openerStub.postMessage.mock.calls.filter(
    ([message]) =>
      (message as { type?: string }).type === 'sketch-import:ready',
  );

describe('SketchImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    openerStub = { postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', {
      value: openerStub,
      configurable: true,
    });
    openSketchProtocol.mockClear();
    unwrapResult.mockReset().mockResolvedValue({ status: 'opened' });
    showDialog.mockClear();
    setLocation.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });
  });

  it('shows only a spinner while it waits', () => {
    render(<SketchImport />);
    expect(screen.getByRole('main', { name: 'Loading…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it("posts ready to the opener with target origin '*'", () => {
    render(<SketchImport />);
    expect(openerStub.postMessage).toHaveBeenCalledWith(readyMessage, '*');
  });

  it('re-posts ready every second until a payload arrives', async () => {
    render(<SketchImport />);
    expect(readyCalls()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(READY_INTERVAL_MS * 3);
    });
    expect(readyCalls()).toHaveLength(4);

    post(openerStub, makePayload());
    await flush();
    act(() => {
      vi.advanceTimersByTime(READY_INTERVAL_MS * 3);
    });
    expect(readyCalls()).toHaveLength(4);
  });

  it('ignores a payload from a window other than the opener', async () => {
    render(<SketchImport />);
    post({ postMessage: vi.fn() }, makePayload());
    await flush();
    expect(openSketchProtocol).not.toHaveBeenCalled();
  });

  it.each([
    'https://attacker.example',
    'https://sketch.networkcanvas.com.attacker.example',
    'http://localhost:5173',
  ])('ignores a payload from the disallowed origin %s', async (origin) => {
    render(<SketchImport />);
    post(openerStub, makePayload(), origin);
    await flush();
    expect(openSketchProtocol).not.toHaveBeenCalled();
    // Still waiting, and still asking.
    act(() => {
      vi.advanceTimersByTime(READY_INTERVAL_MS);
    });
    expect(readyCalls()).toHaveLength(2);
  });

  it('ignores unrelated messages from the opener', async () => {
    render(<SketchImport />);
    post(openerStub, { type: 'something-else' });
    post(openerStub, 'hello');
    await flush();
    expect(openSketchProtocol).not.toHaveBeenCalled();
    expect(screen.getByRole('main', { name: 'Loading…' })).toBeInTheDocument();
  });

  it.each([
    ['a missing protocol', { protocol: undefined }],
    ['an array protocol', { protocol: [] }],
    ['a missing name', { name: undefined }],
    ['an empty name', { name: '  ' }],
    ['non-array assets', { assets: {} }],
    [
      'an asset whose data is not a Blob',
      { assets: [{ id: 'a', name: 'a.png', data: 'bytes' }] },
    ],
    ['an unknown version', { version: 2 }],
  ])('rejects a payload with %s and reports an error', async (_, overrides) => {
    render(<SketchImport />);
    post(openerStub, makePayload(overrides));
    await flush();

    expect(openSketchProtocol).not.toHaveBeenCalled();
    expect(openerStub.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sketch-import:result',
        version: 1,
        status: 'error',
      }),
      SKETCH_ORIGIN,
    );
    expect(
      screen.getByRole('heading', { name: "Your protocol couldn't be opened" }),
    ).toBeInTheDocument();
  });

  it('imports a good payload and posts the result back to its origin', async () => {
    const previewOrigin =
      'https://deploy-preview-7--sketch-networkcanvas.netlify.app';
    render(<SketchImport />);
    post(openerStub, makePayload(), previewOrigin);
    await flush();

    expect(openSketchProtocol).toHaveBeenCalledTimes(1);
    const [args] = openSketchProtocol.mock.calls[0]! as [
      {
        protocol: unknown;
        name: string;
        assets: { id: string; name: string; data: Blob }[];
      },
    ];
    expect(args.protocol).toEqual(makeProtocol());
    expect(args.name).toBe('My study');
    // Named by the manifest, as a .netcanvas extraction names it.
    expect(args.assets).toEqual([
      { id: 'roster', name: 'Class roster', data: expect.any(Blob) },
    ]);

    expect(openerStub.postMessage).toHaveBeenCalledWith(
      { type: 'sketch-import:result', version: 1, status: 'opened' },
      previewOrigin,
    );
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ result: { status: 'opened' } }),
    );
  });

  it('accepts only the first payload', async () => {
    render(<SketchImport />);
    post(openerStub, makePayload());
    post(openerStub, makePayload({ name: 'Second' }));
    await flush();
    expect(openSketchProtocol).toHaveBeenCalledTimes(1);
  });

  it('reports a failed open to Sketch and shows the error screen', async () => {
    unwrapResult.mockResolvedValue({
      status: 'validation-error',
      message: 'stages[0] is invalid',
    });
    render(<SketchImport />);
    post(openerStub, makePayload());
    await flush();

    expect(openerStub.postMessage).toHaveBeenCalledWith(
      {
        type: 'sketch-import:result',
        version: 1,
        status: 'error',
        message: 'stages[0] is invalid',
      },
      SKETCH_ORIGIN,
    );
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: { status: 'validation-error', message: 'stages[0] is invalid' },
      }),
    );
    const heading = screen.getByRole('heading', {
      name: "Your protocol couldn't be opened",
    });
    expect(heading).toHaveFocus();
  });

  it('shows the timeout screen after 30 seconds without a payload', () => {
    render(<SketchImport />);
    act(() => {
      vi.advanceTimersByTime(PAYLOAD_TIMEOUT_MS - 1);
    });
    expect(
      screen.queryByRole('heading', { name: "Your protocol didn't arrive" }),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const heading = screen.getByRole('heading', {
      name: "Your protocol didn't arrive",
    });
    expect(heading).toHaveFocus();

    // It stops asking once it has given up.
    const asked = readyCalls().length;
    act(() => {
      vi.advanceTimersByTime(READY_INTERVAL_MS * 5);
    });
    expect(readyCalls()).toHaveLength(asked);

    fireEvent.click(
      screen.getByRole('button', { name: 'Return to Start Screen' }),
    );
    expect(setLocation).toHaveBeenCalledWith('/', { replace: true });
  });

  it('sends a visitor who did not come from Sketch to the start screen', () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });
    const { container } = render(<SketchImport />);

    expect(setLocation).toHaveBeenCalledWith('/', { replace: true });
    expect(container).toBeEmptyDOMElement();
  });
});
