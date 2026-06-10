import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { DeckSlotCard } from '../DeckSlotCard';

function makeProtocol(name: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description: 'A description.',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `test-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 8,
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
};

describe('DeckSlotCard', () => {
  it('renders an active protocol card with a start button and delete control', () => {
    const activate = vi.fn();
    const onDeleteProtocol = vi.fn();
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'protocol', protocol: makeProtocol('Friendship Ties') }}
        activate={activate}
        onDeleteProtocol={onDeleteProtocol}
      />,
    );

    expect(screen.getByText('Friendship Ties')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Start new interview' }),
    );
    expect(activate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Protocol' }));
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

  it('renders the pending card with the phase label', () => {
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
  });
});
