import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { MailingListForm } from '../MailingListForm';

afterEach(cleanup);

describe('MailingListForm', () => {
  it('submits with a Fresco button and announces success', () => {
    renderWithIntl(<MailingListForm />);

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
    const message = within(confirmation).getByText(
      "Thanks! We'll be in touch.",
    );

    expect(confirmation).toHaveAttribute('aria-live', 'polite');
    expect(message).toHaveClass('font-body', 'text-pretty');
  });

  it('renders and announces Spanish form copy', () => {
    renderWithIntl(<MailingListForm />, 'es');

    const email = screen.getByRole('textbox', {
      name: 'Dirección de correo electrónico',
    });
    fireEvent.change(email, { target: { value: 'researcher@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirse a la lista' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      '¡Gracias! Nos pondremos en contacto.',
    );
  });
});
