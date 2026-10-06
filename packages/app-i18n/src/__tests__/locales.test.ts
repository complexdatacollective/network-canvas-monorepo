import { describe, expect, it, vi } from 'vitest';

import {
  createCatalogSource,
  defineAppLocales,
  ecosystemLocales,
  loadCatalog,
  mergeCatalogs,
  pseudoAppLocale,
} from '../locales.ts';
import type { CatalogMessages } from '../locales.ts';

describe('defineAppLocales', () => {
  it('rejects non-canonical tags, duplicates, and empty labels', () => {
    expect(() =>
      defineAppLocales([{ locale: 'EN-gb', label: 'x', direction: 'ltr' }]),
    ).toThrow(/canonical/);
    expect(() =>
      defineAppLocales([
        { locale: 'en', label: 'English', direction: 'ltr' },
        { locale: 'en', label: 'English', direction: 'ltr' },
      ]),
    ).toThrow(/duplicate/);
    expect(() =>
      defineAppLocales([{ locale: 'en', label: '  ', direction: 'ltr' }]),
    ).toThrow(/empty label/);
  });
});

describe('ecosystemLocales', () => {
  it('opens with the English source locale and includes en-GB', () => {
    expect(ecosystemLocales[0]?.locale).toBe('en');
    expect(ecosystemLocales.map((entry) => entry.locale)).toContain('en-GB');
  });

  it('does not include the pseudo-locale', () => {
    expect(ecosystemLocales.map((entry) => entry.locale)).not.toContain(
      pseudoAppLocale.locale,
    );
  });
});

describe('mergeCatalogs', () => {
  it('merges later catalogs over earlier ones', () => {
    expect(
      mergeCatalogs({ 'a.x': 'one', 'a.y': 'keep' }, { 'a.x': 'two' }),
    ).toEqual({ 'a.x': 'two', 'a.y': 'keep' });
  });
});

const moduleOf = (catalog: CatalogMessages) =>
  Promise.resolve({ default: catalog });

describe('loadCatalog', () => {
  it('merges one locale from each package in the order given', async () => {
    expect(
      await loadCatalog(
        'es',
        { es: () => moduleOf({ 'common.x': 'uno', 'shared.y': 'base' }) },
        { de: () => moduleOf({ 'app.z': 'nicht geladen' }) },
        { es: () => moduleOf({ 'shared.y': 'app' }) },
      ),
    ).toEqual({ 'common.x': 'uno', 'shared.y': 'app' });
  });

  it('loads only the locale asked for', async () => {
    const de = vi.fn(() => moduleOf({ 'a.x': 'eins' }));
    await loadCatalog('es', { es: () => moduleOf({}), de });
    expect(de).not.toHaveBeenCalled();
  });
});

describe('createCatalogSource', () => {
  it('has a locale nobody translates ready without a load', () => {
    const es = vi.fn(() => moduleOf({ 'a.x': 'uno' }));
    const source = createCatalogSource({ es });
    expect(source.peek('en')).toEqual({});
    expect(source.peek('en-XA')).toEqual({});
    expect(es).not.toHaveBeenCalled();
  });

  it('holds a translated locale back until it has loaded, then keeps it', async () => {
    const es = vi.fn(() => moduleOf({ 'a.x': 'uno' }));
    const source = createCatalogSource({ es });
    expect(source.peek('es')).toBeUndefined();

    const first = source.load('es');
    const second = source.load('es');
    expect(second).toBe(first);
    expect(await first).toEqual({ 'a.x': 'uno' });
    expect(source.peek('es')).toEqual({ 'a.x': 'uno' });

    expect(await source.load('es')).toBe(source.peek('es'));
    expect(es).toHaveBeenCalledOnce();
  });

  it('tells subscribers when a locale finishes loading', async () => {
    const source = createCatalogSource({ es: () => moduleOf({}) });
    const onLoad = vi.fn();
    const unsubscribe = source.subscribe(onLoad);
    await source.load('es');
    expect(onLoad).toHaveBeenCalledOnce();

    unsubscribe();
    await createCatalogSource({ fr: () => moduleOf({}) }).load('fr');
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('hands a failed attempt to the next attempt, rather than starting another, until load tries again', async () => {
    const es = vi
      .fn<() => Promise<{ default: CatalogMessages }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => moduleOf({ 'a.x': 'uno' }));
    const source = createCatalogSource({ es });

    const failure = source.attempt('es');
    await expect(failure).rejects.toThrow('offline');
    expect(source.attempt('es')).toBe(failure);
    expect(es).toHaveBeenCalledOnce();

    const retry = source.load('es');
    expect(source.attempt('es')).toBe(retry);
    expect(await retry).toEqual({ 'a.x': 'uno' });
    expect(es).toHaveBeenCalledTimes(2);
  });

  it('leaves the attempt after a failed load to try afresh', async () => {
    const es = vi
      .fn<() => Promise<{ default: CatalogMessages }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => moduleOf({ 'a.x': 'uno' }));
    const source = createCatalogSource({ es });

    await expect(source.load('es')).rejects.toThrow('offline');
    expect(await source.attempt('es')).toEqual({ 'a.x': 'uno' });
    expect(es).toHaveBeenCalledTimes(2);
  });

  it('replaces a failed load with a fresh one on the next load', async () => {
    const es = vi
      .fn<() => Promise<{ default: CatalogMessages }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => moduleOf({ 'a.x': 'uno' }));
    const source = createCatalogSource({ es });

    await expect(source.load('es')).rejects.toThrow('offline');
    expect(source.peek('es')).toBeUndefined();
    expect(await source.load('es')).toEqual({ 'a.x': 'uno' });
    expect(es).toHaveBeenCalledTimes(2);
  });
});
