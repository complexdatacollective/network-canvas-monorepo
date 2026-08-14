import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FieldErrors from './FieldErrors';

describe('FieldErrors', () => {
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
