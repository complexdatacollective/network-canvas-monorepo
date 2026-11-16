import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Mirrors StageTypeImage's real output closely enough for name computation:
// an `<img>`, whose empty `alt` makes it presentational exactly as the browser
// treats it. A `role="img"` stand-in with `aria-label=""` would not — an empty
// label leaves the image in the tree, so a regression that put the title back
// in the alt would still pass.
vi.mock('@codaco/protocol-builder/interfaces/StageTypeImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

beforeAll(() => {
  // jsdom does not implement scrollIntoView, which the highlight effect calls.
  Element.prototype.scrollIntoView = vi.fn();
});

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

  it('is named by its title alone, and described by the rest of the card', () => {
    render(<Interface type="NameGenerator" onClick={vi.fn()} />);

    // Exactly the title: a button with no explicit label takes its name from
    // everything inside it, which here was the title twice (the screenshot's
    // alt, then the heading), the whole description sentence and every tag —
    // so a researcher moving through this dialog's buttons heard one
    // paragraph per card and the title of the next one only after it.
    const option = screen.getByRole('button');
    expect(option).toHaveAccessibleName('Name Generator (using forms)');

    // None of that content is lost: it moves to the description, which
    // assistive technology announces after the name and can skip.
    expect(option).toHaveAccessibleDescription(
      'A name generator interface which provides a form that participants complete when creating an alter. Create nodes Capture Node Attributes Use Roster Data',
    );
  });

  it('takes the keyboard highlight on focus and gives it up on blur', () => {
    const setHighlighted = vi.fn();
    const removeHighlighted = vi.fn();
    render(
      <Interface
        type="NameGenerator"
        onClick={vi.fn()}
        setHighlighted={setHighlighted}
        removeHighlighted={removeHighlighted}
      />,
    );

    const option = screen.getByRole('button', {
      name: /Name Generator \(using forms\)/,
    });

    fireEvent.focus(option);
    expect(setHighlighted).toHaveBeenCalledTimes(1);
    expect(removeHighlighted).not.toHaveBeenCalled();

    fireEvent.blur(option);
    expect(removeHighlighted).toHaveBeenCalledTimes(1);
  });

  it('scrolls itself into view when it becomes the highlighted option', () => {
    const { rerender } = render(
      <Interface type="NameGenerator" onClick={vi.fn()} />,
    );
    const option = screen.getByRole('button');
    const scrollIntoView = vi.mocked(option.scrollIntoView);
    scrollIntoView.mockClear();

    rerender(<Interface type="NameGenerator" onClick={vi.fn()} highlighted />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
