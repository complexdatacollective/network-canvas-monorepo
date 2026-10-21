import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { DeckSlotCard } from '../DeckSlotCard';

// NewSessionForm reaches for useStepUpAuth + the DB facade; the slot card
// only needs to prove it mounted the form in the footer slot.
vi.mock('../../NewSessionForm', () => ({
  NewSessionForm: () => <div data-testid="new-session-form" />,
}));

function makeProtocol(name: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description: 'A description.',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    stages: [],
  };
  return {
    id: `test-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 9,
    importedAt: '2026-05-20T10:00:00.000Z',
    description: 'A description.',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

const noop = () => {};

const baseProps = {
  isActive: true,
  activate: noop,
  sessionCount: 0,
  onDeleteProtocol: noop,
  onDismissSample: noop,
  onInstallSample: noop,
  onInstallDevelopment: noop,
};

describe('DeckSlotCard', () => {
  it('renders an active protocol card with its schema, a start button and a menu of Info and Delete', async () => {
    const activate = vi.fn();
    const onDeleteProtocol = vi.fn();
    const onShowProtocolInfo = vi.fn();
    const protocol = makeProtocol('Friendship Ties');
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'protocol', protocol }}
        activate={activate}
        onDeleteProtocol={onDeleteProtocol}
        onShowProtocolInfo={onShowProtocolInfo}
      />,
    );

    expect(screen.getByText('Friendship Ties')).toBeInTheDocument();
    // The current schema carries no "older" cue.
    expect(screen.getByTestId('deck-card-schema')).toHaveTextContent(
      /^Schema 9$/,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Start new interview' }),
    );
    expect(activate).toHaveBeenCalledTimes(1);
    // Every protocol card has the same menu; none has a bare delete button.
    expect(
      screen.queryByRole('button', { name: 'Delete Protocol' }),
    ).not.toBeInTheDocument();

    const openMenu = async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Actions for Friendship Ties' }),
      );
      return screen.findByRole('menu');
    };
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Info', 'Delete']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Info' }));
    expect(onShowProtocolInfo).toHaveBeenCalledWith(protocol);
    await userEvent.click(
      within(await openMenu()).getByRole('menuitem', { name: 'Delete' }),
    );
    expect(onDeleteProtocol).toHaveBeenCalledWith('hash-Friendship Ties');
  });

  it('renders the sample card with an install button when active', () => {
    const onInstallSample = vi.fn();
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'sample' }}
        onInstallSample={onInstallSample}
      />,
    );

    expect(screen.getByText('Sample Protocol')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Install sample protocol' }),
    );
    expect(onInstallSample).toHaveBeenCalledTimes(1);
  });

  it('renders the development teaser with an install button and no dismiss control', () => {
    const onInstallDevelopment = vi.fn();
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'development' }}
        onInstallDevelopment={onInstallDevelopment}
      />,
    );

    expect(screen.getByText('Development Protocol')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Install development protocol' }),
    );
    expect(onInstallDevelopment).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the pending card with the phase label and metadata skeletons', () => {
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{
          kind: 'pending',
          pending: {
            id: 'p1',
            label: 'Incoming Study',
            source: 'file',
            phase: 'extracting',
          },
        }}
      />,
    );

    expect(screen.getByText('Incoming Study')).toBeInTheDocument();
    expect(screen.getByText('Extracting…')).toBeInTheDocument();
    // Loading fields render progressively: the metadata row is present as
    // skeletons and fills in place when the real protocol lands.
    expect(screen.getByTestId('deck-card-metadata')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ interviews?/)).not.toBeInTheDocument();
  });

  it('clears schema, description, metadata, and menu while the new-session form is open', () => {
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'protocol', protocol: makeProtocol('Friendship Ties') }}
        newSession={{ onCancel: noop, onCreated: noop }}
      />,
    );

    expect(screen.getByTestId('new-session-form')).toBeInTheDocument();
    expect(screen.queryByText('A description.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deck-card-metadata')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deck-card-schema')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Friendship Ties' }),
    ).not.toBeInTheDocument();
  });
});
