import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Kbd from './Kbd';

const capsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('kbd')].map((cap) => cap.textContent);

describe('Kbd', () => {
  it('renders one real kbd element per key', () => {
    const { container } = render(<Kbd keys={['G', 'P']} />);

    expect(capsOf(container)).toEqual(['G', 'P']);
  });

  it('renders a lone unexplained key as a bare kbd, with no wrapper', () => {
    const { container } = render(<Kbd keys="Esc" />);

    expect(container.firstElementChild?.tagName).toBe('KBD');
    expect(container.firstElementChild).toHaveTextContent('Esc');
  });

  it('announces the label instead of the bare caps', () => {
    render(
      <button type="button">
        Activity log <Kbd keys={['G', 'A']} label="Shortcut: G then A" />
      </button>,
    );

    // The caps say nothing useful read out one letter at a time, so the whole
    // phrase stands in for them: not "Activity log G A".
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Activity log Shortcut: G then A',
    );
  });

  it('announces the caps themselves when there is nothing to explain', () => {
    render(
      <button type="button">
        Close <Kbd keys="Esc" />
      </button>,
    );

    expect(screen.getByRole('button')).toHaveAccessibleName('Close Esc');
  });

  it('keeps a combination on one cap when the caller writes it as one', () => {
    const { container } = render(
      <Kbd keys="⌘K" label="Search and commands (Command K)" />,
    );

    expect(capsOf(container)).toEqual(['⌘K']);
  });
});
