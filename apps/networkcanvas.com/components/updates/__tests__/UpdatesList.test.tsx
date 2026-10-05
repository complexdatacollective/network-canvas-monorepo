import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpdatesList } from '~/components/updates/UpdatesList';
import type { Update } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={`/en-US${href}`}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const updates: Update[] = [
  {
    id: 'architect-8-3-1',
    date: '2026-10-14',
    kind: 'fix',
    versions: [{ app: 'architect', version: '8.3.1' }],
    apps: ['architect'],
    title: 'Architect 8.3.1',
    summary: '- Importing a protocol that uses a roster no longer fails.',
  },
  {
    id: 'interviewer-8-4-0',
    date: '2026-10-10',
    kind: 'feature',
    versions: [{ app: 'interviewer', version: '8.4.0' }],
    apps: ['interviewer'],
    title: 'Interviewer 8.4.0',
    summary: '- Export now includes interview notes.',
  },
  {
    id: 'big-launch',
    date: '2026-09-28',
    kind: 'launch',
    versions: [
      { app: 'architect', version: '8.3.0' },
      { app: 'interviewer', version: '8.3.0' },
    ],
    apps: ['architect', 'interviewer'],
    title: 'A big launch',
    summary: 'Something new.',
    details: 'All about it.',
  },
];

function entryTitles() {
  return screen
    .queryAllByRole('article', { hidden: true })
    .map(
      (article) =>
        within(article).getByRole('heading', { level: 2, hidden: true })
          .textContent,
    );
}

function entry(title: string) {
  return screen.getByRole('article', { name: title, hidden: true });
}

function typeFilter(name: string) {
  return within(
    screen.getByRole('group', { name: 'Filter by type', hidden: true }),
  ).getByRole('button', { name, hidden: true });
}

describe('UpdatesList', () => {
  it('labels every entry with its category', () => {
    renderWithIntl(<UpdatesList updates={updates} />);

    expect(entry('Architect 8.3.1')).toHaveTextContent(/^Bug fixes/);
    expect(entry('Interviewer 8.4.0')).toHaveTextContent(/^Feature update/);
    expect(entry('A big launch')).toHaveTextContent(/^Launch/);
  });

  it('shows smaller releases without a details button', () => {
    renderWithIntl(<UpdatesList updates={updates} />);

    for (const title of ['Architect 8.3.1', 'Interviewer 8.4.0']) {
      expect(
        within(entry(title)).queryByRole('button', { hidden: true }),
      ).toBeNull();
    }
    expect(entry('Architect 8.3.1')).toHaveTextContent(
      'Importing a protocol that uses a roster no longer fails.',
    );
  });

  it('narrows the timeline to the chosen categories', () => {
    renderWithIntl(<UpdatesList updates={updates} />);
    expect(entryTitles()).toEqual([
      'Architect 8.3.1',
      'Interviewer 8.4.0',
      'A big launch',
    ]);

    fireEvent.click(typeFilter('Launches'));

    expect(typeFilter('Launches')).toHaveAttribute('aria-pressed', 'true');
    expect(entryTitles()).toEqual(['A big launch']);
    expect(screen.getByText('1 of 3 updates')).toBeInTheDocument();

    fireEvent.click(typeFilter('Bug fixes'));

    expect(entryTitles()).toEqual(['Architect 8.3.1', 'A big launch']);

    fireEvent.click(typeFilter('Launches'));
    fireEvent.click(typeFilter('Bug fixes'));

    expect(entryTitles()).toEqual([
      'Architect 8.3.1',
      'Interviewer 8.4.0',
      'A big launch',
    ]);
  });

  it('counts the updates in view and clears every filter at once', () => {
    renderWithIntl(<UpdatesList updates={updates} />);
    expect(screen.getByText('3 of 3 updates')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear all', hidden: true }),
    ).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { hidden: true }), {
      target: { value: 'export' },
    });
    fireEvent.click(typeFilter('Feature updates'));
    expect(screen.getByText('1 of 3 updates')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all', hidden: true }),
    );

    expect(screen.getByRole('searchbox', { hidden: true })).toHaveValue('');
    expect(typeFilter('Feature updates')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(entryTitles()).toHaveLength(3);
    expect(screen.getByText('3 of 3 updates')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear all', hidden: true }),
    ).toBeNull();
  });
});
