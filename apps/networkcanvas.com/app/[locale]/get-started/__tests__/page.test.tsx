import { cleanup, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import GetStartedPage, { generateMetadata } from '../page';

const metadataMessages = vi.hoisted(() => ({
  'en-US': {
    title: 'Get Started',
    description:
      'Choose the right Network Canvas app for designing a protocol or collecting network data.',
  },
  'en-GB': {
    title: 'Get Started',
    description:
      'Choose the right Network Canvas app for designing a protocol or collecting network data.',
  },
  'es': {
    title: 'Comenzar',
    description:
      'Elija la aplicación de Network Canvas adecuada para diseñar un protocolo o recopilar datos de redes.',
  },
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations:
    async ({ locale }: { locale: 'en-US' | 'en-GB' | 'es' }) =>
    (key: string) => {
      if (key === 'metadata.title') return metadataMessages[locale].title;
      if (key === 'metadata.description') {
        return metadataMessages[locale].description;
      }
      throw new Error(`Unexpected metadata key: ${key}`);
    },
}));

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, ...props }: ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
  usePathname: () => '/get-started',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@codaco/art', () => ({
  PageBackground: () => null,
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

afterEach(cleanup);

describe('localized Get Started page', () => {
  it('renders Spanish research stages and preserves the approved card layout', async () => {
    const page = await GetStartedPage({
      params: Promise.resolve({ locale: 'es' }),
    });
    renderWithIntl(page, 'es');

    const design = document.querySelector<HTMLElement>('#design');
    const collect = document.querySelector<HTMLElement>('#collect');
    if (!design || !collect) {
      throw new Error('Expected both research-stage sections.');
    }

    expect(
      within(design).getByRole('heading', {
        level: 2,
        name: 'Diseñar o crear un protocolo',
      }),
    ).toBeInTheDocument();
    expect(
      within(collect).getByRole('heading', {
        level: 2,
        name: 'Recopilar datos',
      }),
    ).toBeInTheDocument();

    const appNames = ['Interviewer', 'Fresco', 'Interviewer Classic'];
    const cards = appNames.map((name) =>
      within(collect)
        .getByRole('heading', { level: 3, name })
        .closest('article'),
    );
    expect(
      within(collect)
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(appNames);
    expect(cards[0]?.parentElement).toHaveClass('tablet-landscape:col-span-6');
    expect(cards[1]?.parentElement).toHaveClass('tablet-landscape:col-span-6');
    expect(cards[2]?.parentElement).toHaveClass('tablet-landscape:col-span-12');
    expect(cards[1]).toHaveClass('bg-slate-blue/10', 'backdrop-blur-md');
  });

  it('generates Spanish metadata and language alternates', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata).toMatchObject({
      title: 'Comenzar',
      description:
        'Elija la aplicación de Network Canvas adecuada para diseñar un protocolo o recopilar datos de redes.',
      alternates: {
        canonical: 'https://networkcanvas.com/es/get-started',
        languages: {
          'en-US': 'https://networkcanvas.com/en-US/get-started',
          'en-GB': 'https://networkcanvas.com/en-GB/get-started',
          'es': 'https://networkcanvas.com/es/get-started',
        },
      },
    });
  });
});
