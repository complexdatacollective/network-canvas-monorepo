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
  apps: ['architect'],
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
});
