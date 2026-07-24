import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { MailingListForm } from '../MailingListForm';

afterEach(cleanup);

describe('MailingListForm', () => {
  it('posts the email address to the Network Canvas Mailchimp list', () => {
    const { container } = renderWithIntl(<MailingListForm />);

    const email = screen.getByRole('textbox', { name: 'Email address' });
    const submit = screen.getByRole('button', { name: 'Join List' });
    const form = container.querySelector('form');
    const honeypot = container.querySelector(
      'input[name="b_66b037bad92d8f1f552b9097f_fce94667d6"]',
    );

    expect(form).toHaveAttribute(
      'action',
      'https://networkcanvas.us14.list-manage.com/subscribe/post?u=66b037bad92d8f1f552b9097f&id=fce94667d6',
    );
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('target', '_blank');
    expect(email).toHaveAttribute('name', 'EMAIL');
    expect(submit).toHaveAttribute('type', 'submit');
    expect(submit).toHaveClass(
      'h-12',
      'elevation-low',
      'not-disabled:active:translate-y-[2px]',
    );

    fireEvent.change(email, { target: { value: 'researcher@example.com' } });

    expect(email).toHaveValue('researcher@example.com');
    expect(honeypot).toHaveValue('');
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot?.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(honeypot?.parentElement).toHaveClass('sr-only');

    if (!(form instanceof HTMLFormElement)) {
      throw new TypeError('Expected the mailing-list form to render');
    }

    const formData = new FormData(form);
    expect(formData.get('EMAIL')).toBe('researcher@example.com');
    expect(formData.get('b_66b037bad92d8f1f552b9097f_fce94667d6')).toBe('');
  });

  it('renders Spanish form copy', () => {
    renderWithIntl(<MailingListForm />, 'es');

    expect(
      screen.getByRole('textbox', {
        name: 'Dirección de correo electrónico',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unirse a la lista' }),
    ).toBeInTheDocument();
  });
});
