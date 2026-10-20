import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolWithCounts } from '~/lib/db/types';

import { DeckSlotCard, type Schema8CardActions } from '../DeckSlotCard';

const { newSessionForm } = vi.hoisted(() => ({
  newSessionForm: vi.fn((props: { protocol: { hash: string } }) => {
    void props;
    return null;
  }),
}));
vi.mock('../../NewSessionForm', () => ({
  NewSessionForm: newSessionForm,
}));

const protocol = {
  id: 'schema-8-row',
  hash: 'schema-8-hash',
  name: 'Wave One',
  schemaVersion: 8,
  importedAt: '2025-05-20T10:00:00.000Z',
  description: 'The first wave.',
  codebook: {},
  protocol: { name: 'Wave One', schemaVersion: 8, codebook: {}, stages: [] },
  sessionCount: 3,
} as ProtocolWithCounts;

const noop = () => {};

const makeActions = (
  overrides: Partial<Schema8CardActions> = {},
): Schema8CardActions => ({
  interviewer: { version: '8.5.0', path: '/v8/' },
  offline: 'ready',
  onShowInfo: vi.fn(),
  ...overrides,
});

const renderCard = (
  schema8: Schema8CardActions,
  {
    activate = noop,
    onDeleteProtocol = noop,
    newSession,
  }: {
    activate?: () => void;
    onDeleteProtocol?: (hash: string) => void;
    newSession?: { onCancel: () => void; onCreated: () => void };
  } = {},
) =>
  render(
    <DeckSlotCard
      entry={{ kind: 'protocol', protocol }}
      isActive
      activate={activate}
      sessionCount={protocol.sessionCount}
      onDeleteProtocol={onDeleteProtocol}
      onDismissSample={noop}
      onInstallSample={noop}
      onInstallDevelopment={noop}
      schema8={schema8}
      newSession={newSession}
    />,
  );

const openMenu = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for Wave One' }),
  );
  return screen.findByRole('menu');
};

describe('DeckSlotCard for a schema 8 protocol', () => {
  it('is a protocol card with its schema shown, starting interviews like any other', async () => {
    const activate = vi.fn();
    renderCard(makeActions(), { activate });

    expect(screen.getByText('Wave One')).toBeInTheDocument();
    expect(screen.getByText('Schema 8')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Not ready offline' }),
    ).not.toBeInTheDocument();
    // Its stages need no internet, and Interviewer 8 is saved for offline use.
    expect(screen.queryByText('Requires Internet')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Start new interview' }),
    );
    expect(activate).toHaveBeenCalledTimes(1);
    // Its interviews are in this app's data view, like any protocol's.
    expect(screen.getByRole('link', { name: '3 interviews' })).toHaveAttribute(
      'href',
      '/data?protocol=Wave+One',
    );
  });

  it('opens the normal new-interview form', () => {
    renderCard(makeActions(), {
      newSession: { onCancel: noop, onCreated: noop },
    });
    expect(newSessionForm).toHaveBeenCalledWith(
      expect.objectContaining({ protocol }),
      undefined,
    );
  });

  it('offers Info and the normal Delete, and no upgrade or anything that leaves the app', async () => {
    const schema8 = makeActions();
    const onDeleteProtocol = vi.fn();
    renderCard(schema8, { onDeleteProtocol });

    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Info', 'Delete']);

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Info' }));
    expect(schema8.onShowInfo).toHaveBeenCalledWith(protocol);

    await userEvent.click(
      within(await openMenu()).getByRole('menuitem', { name: 'Delete' }),
    );
    expect(onDeleteProtocol).toHaveBeenCalledWith('schema-8-hash');
    expect(screen.queryByText(/Interviewer 8/)).not.toBeInTheDocument();
  });

  it('marks the schema badge while Interviewer 8 is not ready offline', () => {
    renderCard(makeActions({ offline: 'not-ready' }));
    const badge = screen.getByText('Schema 8');
    expect(
      within(badge).getByRole('img', { name: 'Not ready offline' }),
    ).toBeInTheDocument();
    // Requires Internet is only for protocols that always need it.
    expect(screen.queryByText('Requires Internet')).not.toBeInTheDocument();
  });

  it('starts no interview, and says why, when Interviewer 8 is not bundled', async () => {
    renderCard(makeActions({ interviewer: null, offline: 'not-bundled' }));

    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start new interview' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/interviews cannot be started with this protocol here/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3 interviews' })).toBeVisible();

    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Info', 'Delete']);
  });
});
