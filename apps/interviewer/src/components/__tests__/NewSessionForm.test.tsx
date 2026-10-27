import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { interviewerProductionLocales } from '~/i18n/locales';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';
import { interviewerCatalogSource } from '~/locales/catalogs';

const openDialog = vi.fn();
const createSession = vi.fn();
const getSettings = vi.fn();
const requireFreshUnlock = vi.fn();
const setAuthorizedInterviewId = vi.fn();
let online = true;
let bundledInterviewer8: { version: string; path: '/v8/' } | null = null;
let interviewer8Offline: 'not-bundled' | 'checking' | 'ready' | 'not-ready' =
  'ready';

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog, closeDialog: vi.fn(), confirm: vi.fn() }),
}));
vi.mock('~/lib/net/OnlineStatusProvider', () => ({
  useOnline: () => online,
}));
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock, setAuthorizedInterviewId }),
}));
vi.mock('~/lib/db/api', () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  getSettings: () => getSettings(),
}));
vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  getBundledLegacyInterviewer: () => bundledInterviewer8,
}));
vi.mock('~/lib/pwa/legacyInterviewerOffline', () => ({
  useLegacyInterviewerOffline: () => interviewer8Offline,
}));
vi.mock('@codaco/interview', () => ({
  createInitialNetwork: () => ({ nodes: [], edges: [], ego: {} }),
}));

import { NewSessionForm, NewSessionFormView } from '../NewSessionForm';

// The renders below show Spanish synchronously, as a device that has already
// loaded it would, so its catalog loads before any of them.
await interviewerCatalogSource.load('es');

function makeProtocol(stageTypes: string[]): ProtocolWithCounts {
  const stages = stageTypes.map((type, index) => ({
    id: `stage-${index}`,
    type,
    label: type,
  }));
  const protocol = {
    name: 'Test',
    description: '',
    schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    codebook: {},
    stages,
  } as unknown as CurrentProtocol;
  return {
    id: 'test',
    hash: 'hash',
    name: 'Test',
    schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    importedAt: '2026-07-01T00:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

const session: StoredSession = {
  id: 'session-1',
} as unknown as StoredSession;

function Harness({ protocol }: { protocol: ProtocolWithCounts }): ReactNode {
  return (
    <NewSessionForm
      protocol={protocol}
      onCreated={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

describe('NewSessionForm offline warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online = true;
    getSettings.mockResolvedValue({ requireUnlockOnEnter: false });
    createSession.mockResolvedValue(session);
  });

  it('warns before starting an internet-requiring session while offline and creates the session when the researcher proceeds', async () => {
    online = false;
    openDialog.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'choice', intent: 'warning' }),
    );
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  });

  it('does not create the session when the researcher declines the offline warning', async () => {
    online = false;
    openDialog.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(createSession).not.toHaveBeenCalled();
  });

  it('does not warn when online even for an internet-requiring protocol', async () => {
    online = true;
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('does not warn offline when the protocol does not require internet', async () => {
    online = false;
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['NameGenerator'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('refuses to start an interview on a protocol below the runtime schema version', () => {
    // A session created from it would be refused by the interview route, so
    // no form is offered.
    // No stored protocol is at schema 7 (import migrates it or keeps it at 8),
    // so the type has no room for one; the guard is still checked.
    const schema7 = {
      ...makeProtocol([]),
      schemaVersion: 7,
    } as unknown as ProtocolWithCounts;
    render(<Harness protocol={schema7} />);

    expect(screen.getByText(/could not be updated/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Case ID/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start interview' }),
    ).not.toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });
});

function makeSchema8Protocol(stageTypes: string[]): ProtocolWithCounts {
  const base = makeProtocol(stageTypes);
  return {
    ...base,
    schemaVersion: 8,
    protocol: { ...base.protocol, schemaVersion: 8 },
  } as unknown as ProtocolWithCounts;
}

describe('NewSessionForm for a schema 8 protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online = true;
    bundledInterviewer8 = { version: '8.5.0', path: '/v8/' };
    interviewer8Offline = 'ready';
    getSettings.mockResolvedValue({ requireUnlockOnEnter: true });
    createSession.mockResolvedValue(session);
    requireFreshUnlock.mockResolvedValue({ ok: true });
  });

  it('runs the same enter step-up as any interview, once, and authorizes the entry', async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <NewSessionForm
        protocol={makeSchema8Protocol(['NameGenerator'])}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(session));
    // The one unlock: the interview route passes it on to Interviewer 8.
    expect(requireFreshUnlock).toHaveBeenCalledTimes(1);
    expect(setAuthorizedInterviewId).toHaveBeenCalledWith(session.id);
    expect(createSession).toHaveBeenCalledWith({
      protocolHash: 'hash',
      protocolName: 'Test',
      caseId: 'P01',
      initialNetwork: { nodes: [], edges: [], ego: {} },
    });
  });

  it('creates nothing when the enter step-up is declined', async () => {
    requireFreshUnlock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<Harness protocol={makeSchema8Protocol([])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(requireFreshUnlock).toHaveBeenCalledTimes(1));
    expect(createSession).not.toHaveBeenCalled();
  });

  it('warns offline for a schema 8 map stage too', async () => {
    online = false;
    openDialog.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<Harness protocol={makeSchema8Protocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(createSession).not.toHaveBeenCalled();
  });

  it('explains instead of offering the form offline before Interviewer 8 is saved on this device', () => {
    online = false;
    interviewer8Offline = 'not-ready';
    render(<Harness protocol={makeSchema8Protocol([])} />);

    expect(
      screen.getByText(
        /has not finished downloading all data required for fully offline/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Case ID/)).not.toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('offers the form online even before Interviewer 8 is saved on this device', () => {
    interviewer8Offline = 'not-ready';
    render(<Harness protocol={makeSchema8Protocol([])} />);

    expect(screen.getByLabelText(/Case ID/)).toBeInTheDocument();
  });

  it('explains instead of offering the form when this build has no Interviewer 8', () => {
    bundledInterviewer8 = null;
    render(<Harness protocol={makeSchema8Protocol([])} />);

    expect(
      screen.getByText(/interviews cannot be started with this protocol here/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Case ID/)).not.toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });
});

it('uses the chosen administration language for field-owned required validation', async () => {
  const user = userEvent.setup();
  render(
    <AppI18nProvider
      locale="es"
      locales={interviewerProductionLocales}
      messages={interviewerCatalogSource.peek('es')}
    >
      <Harness protocol={makeProtocol(['Information'])} />
    </AppI18nProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'ID del caso' });
  await user.type(input, 'A');
  await user.clear(input);
  await user.tab();
  expect(
    await screen.findByText('El ID del caso es obligatorio'),
  ).toBeVisible();
  expect(input).toHaveAttribute('aria-invalid', 'true');
});

it('keeps a visible Case ID refusal when the administration language changes and permits a corrected value', async () => {
  const user = userEvent.setup();
  const submit = vi.fn().mockResolvedValue({ success: true });
  const view = (locale: string) => (
    <AppI18nProvider
      locale={locale}
      locales={interviewerProductionLocales}
      messages={interviewerCatalogSource.peek(locale)}
    >
      <NewSessionFormView
        requiresInternet={false}
        online
        onSubmit={submit}
        onCancel={vi.fn()}
      />
    </AppI18nProvider>
  );
  const { rerender } = render(view('en'));
  const input = screen.getByRole('textbox', { name: 'Case ID' });
  await user.type(input, 'A');
  await user.clear(input);
  await user.tab();
  expect(await screen.findByText('Case ID is required')).toBeVisible();
  expect(input).toHaveAttribute('aria-invalid', 'true');

  rerender(view('es'));
  expect(
    await screen.findByText('El ID del caso es obligatorio'),
  ).toBeVisible();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Iniciar entrevista' }));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, 'Caso Á-21');
  await user.click(screen.getByRole('button', { name: 'Iniciar entrevista' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledExactlyOnceWith('Caso Á-21'),
  );
});
