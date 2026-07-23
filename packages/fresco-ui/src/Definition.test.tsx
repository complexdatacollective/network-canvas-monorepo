import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Definition from './Definition';

describe('Definition', () => {
  it('exposes the definition on keyboard focus', async () => {
    const user = userEvent.setup();

    render(
      <p>
        A{' '}
        <Definition definition="A collection of people and relationships.">
          network
        </Definition>{' '}
        can represent social structure.
      </p>,
    );

    const term = screen.getByText('network');

    expect(term.tagName).toBe('SPAN');
    expect(term).toHaveAttribute('tabindex', '0');
    expect(term).toHaveClass(
      'text-link',
      'cursor-help',
      'underline',
      'decoration-dashed',
      'focusable',
      'inline-block',
    );
    expect(term).toHaveAccessibleDescription(
      'A collection of people and relationships.',
    );

    await user.tab();

    expect(term).toHaveFocus();
    await waitFor(() => expect(term).toHaveAttribute('data-popup-open'));

    const popup = document.querySelector(
      '[data-base-ui-portal] [data-open][aria-hidden="true"]',
    );

    expect(popup).toHaveClass(
      'w-max',
      'max-w-[min(var(--available-width),var(--container-sm))]',
      'text-pretty',
    );
  });

  it('can identify an abbreviation semantically', () => {
    render(
      <Definition
        asAbbreviation
        definition="Computer-assisted personal interviewing"
      >
        CAPI
      </Definition>,
    );

    const abbreviation = screen.getByText('CAPI');

    expect(abbreviation.tagName).toBe('ABBR');
    expect(abbreviation).not.toHaveAttribute('title');
    expect(abbreviation).toHaveAttribute('tabindex', '0');
    expect(abbreviation).toHaveAccessibleDescription(
      'Computer-assisted personal interviewing',
    );
  });

  it('opens when pressed without receiving focus', async () => {
    render(
      <Definition definition="A collection of people and relationships.">
        network
      </Definition>,
    );

    const term = screen.getByText('network');

    fireEvent.click(term);

    expect(term).not.toHaveFocus();
    await waitFor(() => expect(term).toHaveAttribute('data-popup-open'));
  });
});
