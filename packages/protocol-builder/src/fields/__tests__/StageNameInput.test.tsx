import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import StageNameInput from '../StageNameInput.tsx';

describe('StageNameInput', () => {
  it('preserves hero styling while surfacing the field state the form injects', () => {
    const onChange = vi.fn();

    render(
      <StageNameInput
        name="label"
        value=""
        onChange={onChange}
        characterLimit={50}
        aria-required
        aria-invalid
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('maxlength', '50');
    // The control wraps but holds one line, and Enter never adds another —
    // a textarea's default multiline semantics would describe a keystroke
    // this field does not offer.
    expect(input).toHaveAttribute('aria-multiline', 'false');

    fireEvent.change(input, { target: { value: 'A new name' } });
    expect(onChange).toHaveBeenCalledWith('A new name');
  });

  it('notifies the auto-namer when the control loses focus', () => {
    const onFieldBlur = vi.fn();

    render(<StageNameInput name="label" value="" onFieldBlur={onFieldBlur} />);

    fireEvent.blur(screen.getByRole('textbox'));
    expect(onFieldBlur).toHaveBeenCalledTimes(1);
  });

  // The control is a textarea so that a long name wraps instead of being cut
  // off at the edge of the column. Its height comes from a copy of the text
  // laid out behind it: nothing measures anything, so the copy going stale is
  // the one way the height can be wrong.
  it('lays the same text out behind the control, which is what gives it its height', () => {
    const { container, rerender } = render(
      <StageNameInput
        name="label"
        value=""
        placeholder="Enter stage name..."
      />,
    );

    const sizingCopy = container.querySelector('[aria-hidden="true"]');
    // The trailing space is load-bearing: it holds the height of a line that
    // ends in whitespace, which a block would otherwise collapse away.
    expect(sizingCopy?.textContent).toBe('Enter stage name... ');

    rerender(
      <StageNameInput
        name="label"
        value="How you know each person"
        placeholder="Enter stage name..."
      />,
    );

    expect(sizingCopy?.textContent).toBe('How you know each person ');
    // One control, not two: the copy is scenery, and a second textbox would
    // be offered to a screen reader as another field to fill in.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('puts a pasted name on one line without shortening it', () => {
    const onChange = vi.fn();

    render(
      <StageNameInput
        name="label"
        value=""
        onChange={onChange}
        characterLimit={50}
      />,
    );

    const pasted = 'Close ties\n   and weak ties';
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: pasted },
    });

    expect(onChange).toHaveBeenCalledWith('Close ties    and weak ties');
    // Length-preserving on purpose. `maxLength` is the browser's and lands on
    // the raw value first, so a normalisation that shortened the string would
    // leave the cap discarding characters the finished name had room for.
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(pasted.length);
  });

  it('submits the form on Enter rather than typing a line break into the name', () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    const onSubmitButtonClick = vi.fn();

    render(
      <form onSubmit={onSubmit}>
        <StageNameInput name="label" value="Close ties" />
        <button type="submit" onClick={onSubmitButtonClick}>
          Finished Editing
        </button>
      </form>,
    );

    const control = screen.getByRole('textbox');
    const enter = createEvent.keyDown(control, { key: 'Enter' });
    fireEvent(control, enter);

    // Without the preventDefault the keystroke reaches the textarea and adds a
    // line to a value that is meant to be one line.
    expect(enter.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Implicit submission clicks the default button, and the real one carries
    // an `onClick` that reopens the Issues panel on a repeat failed attempt.
    // Submitting the form directly would leave that panel shut.
    expect(onSubmitButtonClick).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter to the IME while a name is still being composed', () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <StageNameInput name="label" value="\u9023\u7d61" />
        <button type="submit">Finished Editing</button>
      </form>,
    );

    const control = screen.getByRole('textbox');
    const enter = createEvent.keyDown(control, {
      key: 'Enter',
      isComposing: true,
    });
    fireEvent(control, enter);

    // This Enter commits the candidate the researcher is choosing. Taking it
    // would submit a half-composed name and navigate away from the editor.
    expect(enter.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['has no submit button', false],
    ['has only a disabled submit button', true],
  ])('leaves Enter inert when the form %s', (_case, withDisabledButton) => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <StageNameInput name="label" value="Close ties" />
        {withDisabledButton && (
          <button type="submit" disabled>
            Finished Editing
          </button>
        )}
      </form>,
    );

    const control = screen.getByRole('textbox');
    const enter = createEvent.keyDown(control, { key: 'Enter' });
    fireEvent(control, enter);

    // What the browser does with an <input>: no default button to press, so
    // Enter does nothing at all.
    expect(enter.defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
