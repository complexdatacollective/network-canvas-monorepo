import { setRequestLocale } from 'next-intl/server';
import { describe, expect, it, vi } from 'vitest';

import SummerUpdateRoute, { generateMetadata } from '../page';

const metadataMessages = vi.hoisted(() => ({
  'en-US': {
    title: 'Introducing the next generation of Network Canvas apps',
    description:
      'Meet the redesigned Architect and Interviewer apps, Fresco 4.0.0, and the new Schema 8 protocol format.',
  },
  'en-GB': {
    title: 'Introducing the next generation of Network Canvas apps',
    description:
      'Meet the redesigned Architect and Interviewer apps, Fresco 4.0.0, and the new Schema 8 protocol format.',
  },
  'es': {
    title:
      'Presentamos la próxima generación de aplicaciones de Network Canvas',
    description:
      'Conoce las aplicaciones rediseñadas Architect e Interviewer, Fresco 4.0.0 y el nuevo formato de protocolos del esquema 8.',
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

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

vi.mock('~/components/summer-update/SummerUpdatePage', () => ({
  SummerUpdatePage: () => null,
}));

describe('localized Summer 2026 update route', () => {
  it('sets the request locale from the route', async () => {
    await SummerUpdateRoute({ params: Promise.resolve({ locale: 'es' }) });

    expect(vi.mocked(setRequestLocale)).toHaveBeenCalledWith('es');
  });

  it('returns not found for an unsupported locale', async () => {
    await expect(
      SummerUpdateRoute({ params: Promise.resolve({ locale: 'tlh' }) }),
    ).rejects.toThrow('not found');
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: 'tlh' }) }),
    ).rejects.toThrow('not found');
  });

  it('generates localized Spanish metadata, canonical URL, and alternates', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata).toMatchObject({
      title:
        'Presentamos la próxima generación de aplicaciones de Network Canvas',
      description:
        'Conoce las aplicaciones rediseñadas Architect e Interviewer, Fresco 4.0.0 y el nuevo formato de protocolos del esquema 8.',
      alternates: {
        canonical: 'https://networkcanvas.com/es/summer-2026-update',
        languages: {
          'en-US': 'https://networkcanvas.com/en-US/summer-2026-update',
          'en-GB': 'https://networkcanvas.com/en-GB/summer-2026-update',
          'es': 'https://networkcanvas.com/es/summer-2026-update',
        },
      },
      openGraph: {
        title:
          'Presentamos la próxima generación de aplicaciones de Network Canvas',
        url: 'https://networkcanvas.com/es/summer-2026-update',
        type: 'article',
      },
    });
  });

  it.each(['en-US', 'en-GB'] as const)(
    'uses %s in its canonical URL',
    async (locale) => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });

      expect(metadata.alternates?.canonical).toBe(
        `https://networkcanvas.com/${locale}/summer-2026-update`,
      );
    },
  );
});
