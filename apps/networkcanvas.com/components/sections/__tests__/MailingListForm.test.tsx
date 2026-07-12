import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MailingListForm } from '../MailingListForm';

describe('MailingListForm', () => {
  it('submits with a Fresco button and announces success', () => {
    render(<MailingListForm />);

    const email = screen.getByRole('textbox', { name: 'Email address' });
    const submit = screen.getByRole('button', { name: 'Join List' });

    expect(submit).toHaveAttribute('type', 'submit');
    expect(submit).toHaveClass(
      'h-12',
      'elevation-low',
      'not-disabled:active:translate-y-[2px]',
    );

    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.click(submit);

    const confirmation = screen.getByRole('status');

    expect(confirmation).toHaveAttribute('aria-live', 'polite');
    expect(confirmation).toHaveClass('font-body', 'text-pretty');
    expect(confirmation).toHaveTextContent("Thanks! We'll be in touch.");
  });
});
