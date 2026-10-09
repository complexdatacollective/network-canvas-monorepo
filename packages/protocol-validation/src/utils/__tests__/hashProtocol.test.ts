import { hash } from 'ohash';
import { describe, expect, it } from 'vitest';

import { hashProtocol } from '../hashProtocol.ts';

const localizedProtocol = () => ({
  schemaVersion: 9 as const,
  name: 'Study',
  description: 'About the study',
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  codebook: { node: {} },
  stages: [
    {
      id: 's1',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
    },
  ],
});

describe('hashProtocol', () => {
  it('produces a stable string for the same codebook+stages', () => {
    const protocol = {
      schemaVersion: 8 as const,
      codebook: { node: { person: { variables: {} } } },
      stages: [{ id: 's1', type: 'Information' }],
    };
    expect(hashProtocol(protocol)).toBe(hashProtocol(protocol));
  });

  it('ignores fields outside codebook and stages before schema 9', () => {
    const a = {
      schemaVersion: 8 as const,
      codebook: { node: {} },
      stages: [],
      name: 'Name A',
      description: 'desc',
      lastModified: '2026-01-01',
      assetManifest: { foo: {} },
      experiments: { x: 1 },
      localization: { defaultLocale: 'en', locales: ['en'] },
    };
    const b = {
      schemaVersion: 8 as const,
      codebook: { node: {} },
      stages: [],
      name: 'Name B',
      description: 'different',
      lastModified: '2026-12-31',
      assetManifest: { bar: {} },
      experiments: { y: 2 },
    };
    expect(hashProtocol(a)).toBe(hashProtocol(b));
  });

  it('ignores fields outside localization, interface text, codebook and stages from schema 9', () => {
    const a = {
      ...localizedProtocol(),
      lastModified: '2026-01-01',
      assetManifest: { foo: {} },
      experiments: { x: 1 },
    };
    const b = {
      ...localizedProtocol(),
      name: 'Another study',
      description: 'Different',
      lastModified: '2026-12-31',
      assetManifest: { bar: {} },
      experiments: { y: 2 },
    };
    expect(hashProtocol(a)).toBe(hashProtocol(b));
  });

  it('changes when a translation changes', () => {
    const changed = {
      ...localizedProtocol(),
      stages: [
        {
          id: 's1',
          type: 'Information',
          label: { en: 'Welcome', fr: 'Salut' },
        },
      ],
    };
    expect(hashProtocol(changed)).not.toBe(hashProtocol(localizedProtocol()));
  });

  it('changes when the interview’s shared wording changes', () => {
    const wording = (fr: string) => ({
      ...localizedProtocol(),
      interfaceText: { interview: { continue: { en: 'Continue', fr } } },
    });
    expect(hashProtocol(wording('Suivant'))).not.toBe(
      hashProtocol(wording('Continuer')),
    );
    expect(hashProtocol(wording('Suivant'))).not.toBe(
      hashProtocol(localizedProtocol()),
    );
  });

  it('keeps the hash of a protocol that holds no shared wording', () => {
    // The hash a schema-9 protocol had before shared wording was hashed.
    const { localization, codebook, stages } = localizedProtocol();
    const before = hash({ localization, codebook, stages });

    expect(hashProtocol(localizedProtocol())).toBe(before);
    expect(
      hashProtocol({ ...localizedProtocol(), interfaceText: undefined }),
    ).toBe(before);
  });

  it('changes when the default language changes', () => {
    const changed = {
      ...localizedProtocol(),
      localization: { defaultLocale: 'fr', locales: ['en', 'fr'] },
    };
    expect(hashProtocol(changed)).not.toBe(hashProtocol(localizedProtocol()));
  });

  it('does not change when the order of languages changes', () => {
    const reordered = {
      ...localizedProtocol(),
      localization: { defaultLocale: 'en', locales: ['fr', 'en'] },
    };
    expect(hashProtocol(reordered)).toBe(hashProtocol(localizedProtocol()));
  });

  it('changes when a language is added', () => {
    const changed = {
      ...localizedProtocol(),
      localization: { defaultLocale: 'en', locales: ['en', 'fr', 'es'] },
    };
    expect(hashProtocol(changed)).not.toBe(hashProtocol(localizedProtocol()));
  });

  it('changes when codebook changes', () => {
    const a = {
      schemaVersion: 8 as const,
      codebook: { node: { person: {} } },
      stages: [],
    };
    const b = {
      schemaVersion: 8 as const,
      codebook: { node: { place: {} } },
      stages: [],
    };
    expect(hashProtocol(a)).not.toBe(hashProtocol(b));
  });

  it('changes when stages change', () => {
    const a = {
      schemaVersion: 8 as const,
      codebook: {},
      stages: [{ id: 's1' }],
    };
    const b = {
      schemaVersion: 8 as const,
      codebook: {},
      stages: [{ id: 's2' }],
    };
    expect(hashProtocol(a)).not.toBe(hashProtocol(b));
  });

  it('returns a non-empty string', () => {
    const result = hashProtocol({
      schemaVersion: 8,
      codebook: {},
      stages: [],
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
