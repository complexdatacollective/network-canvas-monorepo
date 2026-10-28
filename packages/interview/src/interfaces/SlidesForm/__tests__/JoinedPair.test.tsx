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

// Each connection shares a person with the next: Alex in the same place,
// then Rosalind in the other.
const connections = [
  { id: 'alex-sam', from: 'Alex', to: 'Sam' },
  { id: 'alex-rosalind', from: 'Alex', to: 'Rosalind' },
  { id: 'rosalind-sam', from: 'Rosalind', to: 'Sam' },
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
  it('keeps a person in the same place in both pairs, and replaces the other', async () => {
    const { rerender } = render(<Pairs index={0} />);
    const alex = screen.getByText('Alex');
    const sam = screen.getByText('Sam');

    rerender(<Pairs index={1} />);

    await waitFor(() => expect(sam).not.toBeInTheDocument());
    expect(screen.getByText('Alex')).toBe(alex);
    expect(screen.getByText('Rosalind')).toBeInTheDocument();
  });

  it('replaces a person who changes place, in reading order', async () => {
    const { rerender } = render(<Pairs index={1} />);
    const rosalind = screen.getByText('Rosalind');

    rerender(<Pairs index={2} />);

    await waitFor(() => expect(rosalind).not.toBeInTheDocument());
    const header = document.querySelector('[data-slide-header]');
    expect(header?.textContent).toBe('RosalindSam');
  });
});
