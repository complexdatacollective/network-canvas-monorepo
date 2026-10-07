import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpdatesList } from '~/components/updates/UpdatesList';
import type { Update } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const update: Update = {
  id: 'release',
  date: '2026-09-30',
  prominence: 'normal',
  title: 'A release',
  summary:
    'See [the release](https://example.test/announcements_(october)_archive).',
};

function search(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { hidden: true }), {
    target: { value },
  });
}

describe('UpdatesList', () => {
  it.each([
    ['2020-12-15', ['Dec 15', '2020']],
    ['2016-07', ['Jul', '2016']],
    ['2013', ['2013']],
  ])('shows the date %s only as precisely as it is known', (date, parts) => {
    const { container } = renderWithIntl(
      <UpdatesList updates={[{ ...update, date }]} />,
    );

    const time = container.querySelector(`time[datetime="${date}"]`);
    expect(
      Array.from(time?.children ?? [], (part) => part.textContent),
    ).toEqual(parts);
  });

  it('does not match words that only appear in a link address', () => {
    renderWithIntl(<UpdatesList updates={[update]} />);

    search('release');
    expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(1);

    search('archive');
    expect(screen.queryAllByRole('article', { hidden: true })).toHaveLength(0);
  });

  it('does not match a reference-style link destination', () => {
    renderWithIntl(
      <UpdatesList
        updates={[
          {
            ...update,
            summary:
              'Ask on the [community][forum].\n\n[forum]: https://example.test/hiddenword',
          },
        ]}
      />,
    );

    search('community');
    expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(1);

    search('hiddenword');
    expect(screen.queryAllByRole('article', { hidden: true })).toHaveLength(0);
  });

  it('matches words inside raw HTML the card displays', () => {
    renderWithIntl(
      <UpdatesList
        updates={[
          {
            ...update,
            summary: 'Intro\n\n<p>New <em>localisation</em> support</p>',
          },
        ]}
      />,
    );

    expect(screen.getByText('localisation')).toBeInTheDocument();

    search('localisation');
    expect(screen.getAllByRole('article', { hidden: true })).toHaveLength(1);
  });
});
