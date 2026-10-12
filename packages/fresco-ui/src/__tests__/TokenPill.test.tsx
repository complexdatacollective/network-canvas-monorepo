import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TokenizedText, TokenPill, tokenPillClasses } from '../TokenPill';

describe('TokenPill', () => {
  it('says its label, and records the token it stands for', () => {
    render(<TokenPill token="name" label="Name" />);

    const pill = screen.getByText('Name');
    expect(pill).toHaveAttribute('data-token', 'name');
    expect(pill).not.toHaveAttribute('data-selected');
  });

  it('is drawn with the classes the editor draws its pills with', () => {
    render(<TokenPill token="name" label="Name" />);

    expect(screen.getByText('Name').className).toBe(tokenPillClasses());
  });

  it('marks itself as selected', () => {
    render(<TokenPill token="name" label="Name" selected />);

    expect(screen.getByText('Name')).toHaveAttribute('data-selected', 'true');
  });
});

describe('TokenizedText', () => {
  const tokens = [
    { id: 'name', label: 'Name' },
    { id: '#', label: 'Number' },
  ];

  it('shows each placeholder as a pill among the words, read through as one sentence', () => {
    render(
      <p data-testid="line">
        <TokenizedText
          parts={['Add ', { token: 'name' }, '’s ', { token: '#' }, ' parents']}
          tokens={tokens}
        />
      </p>,
    );

    const line = screen.getByTestId('line');
    expect(line).toHaveTextContent('Add Name’s Number parents');
    expect(
      [...line.querySelectorAll('[data-token]')].map((pill) => [
        pill.getAttribute('data-token'),
        pill.textContent,
      ]),
    ).toEqual([
      ['name', 'Name'],
      ['#', 'Number'],
    ]);
  });

  it('shows a placeholder it has no label for as the name it was recorded under', () => {
    render(<TokenizedText parts={[{ token: 'relation' }]} tokens={tokens} />);

    expect(screen.getByText('relation')).toHaveAttribute(
      'data-token',
      'relation',
    );
  });
});
