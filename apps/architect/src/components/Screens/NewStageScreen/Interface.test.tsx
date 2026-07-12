import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/StageTypeImage', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

beforeAll(() => {
  // jsdom does not implement scrollIntoView, which the highlight effect calls.
  Element.prototype.scrollIntoView = vi.fn();
});

import Interface from './Interface';

const HighlightHarness = () => {
  const [highlighted, setHighlighted] = useState(false);
  return (
    <Interface
      type="NameGenerator"
      onClick={vi.fn()}
      highlighted={highlighted}
      setHighlighted={() => setHighlighted(true)}
      removeHighlighted={() => setHighlighted(false)}
    />
  );
};

describe('new-stage interface option', () => {
  it('is a keyboard-operable, named button', () => {
    const onClick = vi.fn();

    render(<Interface type="NameGenerator" onClick={onClick} />);

    const option = screen.getByRole('button', {
      name: /Name Generator \(using forms\)/,
    });
    expect(option.tagName).toBe('BUTTON');
    fireEvent.click(option);

    expect(onClick).toHaveBeenCalledWith('NameGenerator');
  });

  it('clears the keyboard highlight on blur', () => {
    render(<HighlightHarness />);

    const option = screen.getByRole('button', {
      name: /Name Generator \(using forms\)/,
    });

    expect(option.className).not.toContain('bg-action');

    fireEvent.focus(option);
    expect(option.className).toContain('bg-action');

    fireEvent.blur(option);
    expect(option.className).not.toContain('bg-action');
  });
});
