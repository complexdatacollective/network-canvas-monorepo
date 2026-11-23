import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../messages/en.json';
import Article from '../article';

const { params } = vi.hoisted(() => ({
  params: {} as { section: string; docPath?: string[] },
}));

vi.mock('next/navigation', () => ({ useParams: () => params }));

vi.mock('~/components/ArticleFeedback', () => ({ default: () => null }));

function renderArticle(route: typeof params) {
  Object.assign(params, { docPath: undefined }, route);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Article
        content={<p>Body</p>}
        headings={[]}
        title="Title"
        showToc={false}
      />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('heading', { level: 4 });
}

describe('Article', () => {
  afterEach(cleanup);

  it('names only the section above a section’s index page', () => {
    const eyebrow = renderArticle({ section: 'design-protocols' });

    expect(eyebrow).toHaveTextContent(/^Design Protocols$/);
  });

  it('adds the first folder of a nested article, with spaces for hyphens', () => {
    const eyebrow = renderArticle({
      section: 'design-protocols',
      docPath: ['interface-documentation', 'sociogram'],
    });

    expect(eyebrow).toHaveTextContent(
      /^Design Protocols\s*interface documentation$/,
    );
  });

  it('falls back to the section’s slug when it has no label', () => {
    const eyebrow = renderArticle({ section: 'field-notes' });

    expect(eyebrow).toHaveTextContent(/^field notes$/);
  });
});
