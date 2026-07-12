import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/StageTypeImage', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

import Interface from './Interface';

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
});
