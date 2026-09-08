import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FieldErrors from './FieldErrors';

describe('FieldErrors', () => {
  /**
   * Revalidating an already-invalid, already-dirty field clears its stored
   * error and writes the identical message back within the same keystroke
   * (formStore discards on every value change, ahead of the async
   * revalidation that restores it), so `show`/`errors` flicker to "no error"
   * and back even though nothing the user can perceive changed. A remount
   * driven straight off that flicker would replay `animate-shake` on every
   * keystroke of an already-shown, unchanged message.
   */
  it('does not remount the error element across a same-tick clear/repopulate blip', () => {
    const { rerender } = render(
      <FieldErrors
        id="field-error"
        name="email"
        show
        errors={['Invalid email address']}
      />,
    );
    const before = screen.getByTestId('email-field-error');

    rerender(<FieldErrors id="field-error" name="email" show={false} />);
    rerender(
      <FieldErrors
        id="field-error"
        name="email"
        show
        errors={['Invalid email address']}
      />,
    );

    expect(screen.getByTestId('email-field-error')).toBe(before);
  });

  it('remounts the error element when the message actually changes', () => {
    const { rerender } = render(
      <FieldErrors id="field-error" name="email" show errors={['Required']} />,
    );
    const before = screen.getByTestId('email-field-error');

    rerender(
      <FieldErrors
        id="field-error"
        name="email"
        show
        errors={['Invalid email address']}
      />,
    );

    expect(screen.getByTestId('email-field-error')).not.toBe(before);
  });

  it('still hides the message once a clear settles rather than reversing', async () => {
    const { rerender } = render(
      <FieldErrors id="field-error" name="email" show errors={['Required']} />,
    );
    expect(screen.getByTestId('email-field-error')).toBeVisible();

    rerender(<FieldErrors id="field-error" name="email" show={false} />);

    await waitFor(() =>
      expect(screen.queryByTestId('email-field-error')).not.toBeInTheDocument(),
    );
  });

  it('renders every validation message when a field has multiple errors', () => {
    render(
      <FieldErrors
        id="field-error"
        show
        errors={['Required', 'Must be unique']}
      />,
    );

    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getByText('Required')).toBeVisible();
    expect(screen.getByText('Must be unique')).toBeVisible();
  });

  /**
   * Issue #1385: the error had to reach a screen reader. A live region is
   * only observed from the moment it is in the DOM, so one that arrives
   * together with its first message is announced late or not at all — which
   * is what swapping two differently-keyed elements produced.
   */
  it('keeps the same live region mounted before and after an error appears', () => {
    const { rerender } = render(<FieldErrors id="field-error" show={false} />);

    const before = document.getElementById('field-error');
    expect(before).not.toBeNull();
    expect(before).toHaveAttribute('aria-live', 'polite');
    expect(before?.textContent).toBe('');

    rerender(<FieldErrors id="field-error" show errors={['Required']} />);

    const after = document.getElementById('field-error');
    expect(after).toBe(before);
    expect(after).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Required')).toBeVisible();
  });

  it('renders nothing visible when asked to show an empty error list', () => {
    render(<FieldErrors id="field-error" name="name" show errors={[]} />);

    expect(screen.queryByTestId('name-field-error')).toBeNull();
    expect(document.getElementById('field-error')).not.toBeNull();
  });
});
