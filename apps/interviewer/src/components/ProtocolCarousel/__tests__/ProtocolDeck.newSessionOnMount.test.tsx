import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import type { ProtocolWithCounts, StoredSessionLite } from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';
import { interviewerCatalogSource } from '~/locales/catalogs';

import type { DeckEntry } from '../deckEntries';
import { ProtocolDeck } from '../ProtocolDeck';

// The per-card form is not under test: a card that says whether it carries
// one is enough to see that the deck rendered it.
vi.mock('../DeckSlotCard', () => ({
  DeckSlotCard: ({
    entry,
    newSession,
  }: {
    entry: DeckEntry;
    newSession?: unknown;
  }) =>
    entry.kind === 'protocol' ? (
      <p>
        {entry.protocol.name}
        {newSession ? ' (new interview form)' : ''}
      </p>
    ) : null,
}));

const protocol: ProtocolWithCounts = {
  id: 'study-hash',
  hash: 'study-hash',
  name: 'Study',
  schemaVersion: 8,
  importedAt: '2026-09-05T00:00:00.000Z',
  codebook: {},
  sessionCount: 0,
  protocol: {
    name: 'Study',
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  },
};
const sessions: StoredSessionLite[] = [];
const pendingImports: PendingImport[] = [];
const noop = () => {};

// A `?start=` link (Interviewer 9 starting a schema 8 protocol in Interviewer
// 8) opens the new-interview form in the deck's first render. The deck holds
// its size still while the form is up, so the on-screen keyboard cannot
// reflow the card, but it still has to take its first size, or it never draws
// a card to hold the form.
describe('ProtocolDeck with the new-interview form open from the start', () => {
  it('lays out and shows the form on the requested card', async () => {
    render(
      <AppI18nProvider
        locale="en"
        locales={interviewerProductionLocales}
        messages={interviewerCatalogSource.peek('en')}
      >
        <ProtocolDeck
          protocols={[protocol]}
          sessions={sessions}
          pendingImports={pendingImports}
          initialProtocolHash="study-hash"
          newSessionProtocolHash="study-hash"
          onImportFile={noop}
          onStartInterview={noop}
          onDeleteProtocol={noop}
          onCancelNewSession={noop}
          onSessionCreated={noop}
        />
      </AppI18nProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('Study (new interview form)')).toBeVisible(),
    );
  });
});
