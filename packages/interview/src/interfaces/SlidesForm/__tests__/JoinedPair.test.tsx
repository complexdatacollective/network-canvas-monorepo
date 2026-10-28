import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import JoinedPair from '../JoinedPair';
import JoinedSlides from '../JoinedSlides';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

// Connections in a chain, each sharing a person with the next.
const connections = [
  { id: 'alex-sam', from: 'Alex', to: 'Sam' },
  { id: 'sam-rosalind', from: 'Sam', to: 'Rosalind' },
];

const part = (name: string) => ({ id: name, content: <span>{name}</span> });

function Pairs({ index }: { index: number }) {
  return (
    <JoinedSlides
      index={index}
      direction={index === 0 ? null : 'forwards'}
      placement="top"
      header="pair"
      renderHeader={(at) => {
        const connection = connections[at]!;
        return (
          <JoinedPair
            from={part(connection.from)}
            to={part(connection.to)}
            connection={{ id: connection.id, content: <hr /> }}
          />
        );
      }}
      renderAnswers={() => null}
      onSettled={() => undefined}
    />
  );
}

describe('JoinedPair', () => {
  it('keeps a person who is in both pairs, and replaces the one who is not', async () => {
    const { rerender } = render(<Pairs index={0} />);
    const sam = screen.getByText('Sam');
    const alex = screen.getByText('Alex');

    rerender(<Pairs index={1} />);

    await waitFor(() => expect(alex).not.toBeInTheDocument());
    expect(screen.getByText('Sam')).toBe(sam);
    expect(screen.getByText('Rosalind')).toBeInTheDocument();
  });

  it('shows the people in reading order', async () => {
    const { rerender } = render(<Pairs index={0} />);
    rerender(<Pairs index={1} />);

    await waitFor(() =>
      expect(screen.queryByText('Alex')).not.toBeInTheDocument(),
    );
    const header = document.querySelector('[data-slide-header]');
    expect(header?.textContent).toBe('SamRosalind');
  });
});
