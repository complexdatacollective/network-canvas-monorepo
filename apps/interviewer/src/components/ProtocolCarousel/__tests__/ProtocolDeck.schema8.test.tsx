import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolWithCounts } from '~/lib/db/types';

import type { DeckEntry } from '../deckEntries';
import type { Schema8CardActions } from '../DeckSlotCard';
import { ProtocolDeck } from '../ProtocolDeck';

// The real deck and carousel; each card is reduced to a button that runs the
// carousel's activation (navigate to it, or run its action when active).
vi.mock('../DeckSlotCard', () => ({
  DeckSlotCard: ({
    entry,
    isActive,
    activate,
  }: {
    entry: DeckEntry;
    isActive: boolean;
    activate: () => void;
  }) =>
    entry.kind === 'protocol' ? (
      <button aria-current={isActive ? 'true' : undefined} onClick={activate}>
        {entry.protocol.schemaVersion === 8 ? 'Schema 8: ' : ''}
        {entry.protocol.name}
      </button>
    ) : null,
}));

const makeProtocol = (name: string): ProtocolWithCounts => ({
  id: name,
  hash: `hash-${name}`,
  name,
  schemaVersion: 9,
  importedAt: '2026-09-05T00:00:00.000Z',
  codebook: {},
  sessionCount: 0,
  protocol: {
    name,
    description: '',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    stages: [],
  },
});

const schema8Protocol = {
  id: 'row',
  hash: 'schema-8-hash',
  name: 'Alpha',
  schemaVersion: 8,
  importedAt: '2025-01-01T00:00:00.000Z',
  codebook: {},
  protocol: { name: 'Alpha', schemaVersion: 8, codebook: {}, stages: [] },
  sessionCount: 0,
} as ProtocolWithCounts;

const makeSchema8 = (
  overrides: Partial<Schema8CardActions> = {},
): Schema8CardActions => ({
  interviewer: { version: '8.5.0', path: '/v8/' },
  onShowInfo: vi.fn(),
  ...overrides,
});

const noop = () => {};

const protocols = (...extra: ProtocolWithCounts[]) => [
  schema8Protocol,
  makeProtocol('Bravo'),
  makeProtocol('Charlie'),
  ...extra,
];

const renderDeck = (props: Partial<Parameters<typeof ProtocolDeck>[0]> = {}) =>
  render(
    <ProtocolDeck
      protocols={protocols()}
      sessions={[]}
      onImportFile={noop}
      onStartInterview={noop}
      onDeleteProtocol={noop}
      {...props}
    />,
  );

describe('ProtocolDeck with schema 8 protocols', () => {
  it('starts a schema 8 interview through the normal new-interview form', async () => {
    const onStartInterview = vi.fn();
    renderDeck({ schema8: makeSchema8(), onStartInterview });

    const card = await screen.findByRole('button', {
      name: 'Schema 8: Alpha',
    });
    await waitFor(() => expect(card).toHaveAttribute('aria-current', 'true'));
    await userEvent.click(card);

    expect(onStartInterview).toHaveBeenCalledWith('schema-8-hash');
  });

  it('starts nothing from a schema 8 card when Interviewer 8 is not bundled', async () => {
    const onStartInterview = vi.fn();
    renderDeck({
      schema8: makeSchema8({ interviewer: null }),
      onStartInterview,
    });

    const card = await screen.findByRole('button', {
      name: 'Schema 8: Alpha',
    });
    await waitFor(() => expect(card).toHaveAttribute('aria-current', 'true'));
    await userEvent.click(card);

    expect(onStartInterview).not.toHaveBeenCalled();
  });
});
