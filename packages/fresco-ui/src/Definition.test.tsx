import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

  it('keeps a replaced term reachable and activatable by keyboard', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn((event: React.MouseEvent) =>
      event.preventDefault(),
    );

    render(
      <Definition
        definition="The original downloadable desktop app."
        // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label
        render={<a href="/install" onClick={onNavigate} />}
      >
        Architect Classic
      </Definition>,
    );

    const term = screen.getByRole('link', { name: 'Architect Classic' });

    expect(term).toHaveAttribute('href', '/install');
    expect(term).not.toHaveAttribute('tabindex');
    expect(term).toHaveClass('cursor-pointer', 'decoration-dashed');
    expect(term).toHaveAccessibleDescription(
      'The original downloadable desktop app.',
    );

    await user.tab();
    expect(term).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledTimes(1);
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
