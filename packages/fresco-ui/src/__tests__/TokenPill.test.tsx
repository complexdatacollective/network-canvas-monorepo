import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TokenizedText, TokenPill, tokenPillClasses } from '../TokenPill';

const pillOf = (container: HTMLElement) =>
  container.querySelector('[data-token]');

describe('TokenPill', () => {
  it('says its label, and records the token it stands for', () => {
    const { container } = render(<TokenPill token="name" label="Name" />);

    const pill = pillOf(container);
    expect(pill).toHaveAttribute('data-token', 'name');
    expect(pill).not.toHaveAttribute('data-selected');
  });

  it('is drawn with the classes the editor draws its pills with', () => {
    const { container } = render(<TokenPill token="name" label="Name" />);

    expect(pillOf(container)?.className).toBe(tokenPillClasses());
  });

  it('sets the value’s name in bold body type, whatever surrounds it', () => {
    // A field label is bold in the heading face; a pill in it reads as the
    // editor's pill does, not as the label's own weight and face.
    const { container } = render(
      <span className="font-heading font-bold">
        Hello <TokenPill token="name" label="Name" />
      </span>,
    );

    expect(pillOf(container)).toHaveClass('font-body', 'font-bold');
  });

  it('opens with the value icon, hidden from screen readers', () => {
    const { container } = render(<TokenPill token="name" label="Name" />);

    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('lucide-syringe');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps its icon on the line its label starts on, and lets the rest of the label wrap', () => {
    const { container } = render(
      <TokenPill token="partner" label="partner of (x) Name" />,
    );

    const pill = container.querySelector('[data-token="partner"]');
    expect(pill).toHaveTextContent('partner of (x) Name');
    const lead = pill?.firstElementChild;
    expect(lead).toHaveClass('whitespace-nowrap');
    expect(lead?.firstElementChild).toBe(pill?.querySelector('svg'));
    // The icon and the first word only: the label wraps after it.
    expect(lead?.textContent).toBe('partner');
    expect(pill?.lastChild?.textContent).toBe(' of (x) Name');
  });

  it('marks itself as selected', () => {
    const { container } = render(
      <TokenPill token="name" label="Name" selected />,
    );

    expect(pillOf(container)).toHaveAttribute('data-selected', 'true');
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
    const { container } = render(
      <TokenizedText parts={[{ token: 'relation' }]} tokens={tokens} />,
    );

    const pill = pillOf(container);
    expect(pill).toHaveAttribute('data-token', 'relation');
    expect(pill).toHaveTextContent('relation');
  });
});
