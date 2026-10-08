import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterviewPayload } from '@codaco/interview';
import { renderWithIntl } from '~/test/renderWithIntl';

import { ProtocolPreview } from '../ProtocolPreview';

type ShellProps = ComponentProps<typeof import('@codaco/interview').Shell>;

const shellProps: ShellProps[] = [];
const lastShellProps = () => {
  const props = shellProps.at(-1);
  if (props === undefined) throw new Error('the Shell was never rendered');
  return props;
};

// The Shell's own completed state (the finish stage's text, the notice, and
// the host's actions) is covered by the interview package. Here it stands in
// for the real one, so the test can see whether the gallery keeps it mounted
// and what it offers there.
vi.mock('@codaco/interview', () => ({
  Shell: (props: ShellProps) => {
    shellProps.push(props);
    return (
      <div data-testid="shell" data-session={props.payload.session.id}>
        <button
          type="button"
          onClick={() =>
            void props.onFinish(
              props.payload.session.id,
              { stageId: 'finish', outcome: 'completed' },
              new AbortController().signal,
            )
          }
        >
          Finish in the Shell
        </button>
        {props.completedActions?.map((action, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <button key={index} type="button" onClick={action.onAction}>
            {action.label}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('@codaco/interview/contract', () => ({
  createAssetUrlOwner: () => ({
    closed: false,
    release: () => undefined,
    resolve: () => Promise.resolve(''),
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

let sessions = 0;
vi.mock('~/lib/protocolPreview', () => ({
  installPreviewProtocol: () =>
    Promise.resolve({
      ok: true,
      install: { protocol: {}, assets: new Map(), migrated: false },
    }),
  createPreviewPayload: (): InterviewPayload => {
    sessions += 1;
    return {
      session: { id: `session-${sessions}` },
      protocol: {},
    } as unknown as InterviewPayload;
  },
}));

const BACK_HREF = '/en-US/protocols/example';
const WAVES = [
  {
    wave: 1,
    protocolFilename: 'example.netcanvas',
    protocolPath: '/protocols/example.netcanvas',
  },
];

beforeEach(() => {
  shellProps.length = 0;
  sessions = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderPreview = async () => {
  renderWithIntl(<ProtocolPreview waves={WAVES} backHref={BACK_HREF} />);
  return screen.findByTestId('shell');
};

describe('<ProtocolPreview />', () => {
  it('keeps the interview on screen once it is finished, so its completed state shows', async () => {
    const shell = await renderPreview();
    expect(shell).toHaveAttribute('data-session', 'session-1');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Finish in the Shell' }),
      );
    });

    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-session',
      'session-1',
    );
    expect(
      screen.queryByRole('heading', { name: 'Preview finished' }),
    ).toBeNull();
  });

  it('offers starting again, then going back, on the completed state', async () => {
    await renderPreview();

    expect(
      lastShellProps().completedActions?.map((action) => action.label),
    ).toEqual(['Start the preview again', 'Back to the protocol']);
  });

  it('starts a new interview when the preview is started again', async () => {
    await renderPreview();

    fireEvent.click(
      screen.getByRole('button', { name: 'Start the preview again' }),
    );

    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-session',
      'session-2',
    );
    expect(lastShellProps().currentStep).toBe(0);
  });

  it('goes back to the protocol', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await renderPreview();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to the protocol' }),
    );

    expect(assign).toHaveBeenCalledWith(BACK_HREF);
  });
});
