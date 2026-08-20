import { describe, expect, it } from 'vitest';

import { documentFilename, slug } from '../filename';

describe('slug', () => {
  it('lowercases and hyphenates a title', () => {
    expect(slug('Quadrants Background')).toBe('quadrants-background');
  });

  it('collapses runs of punctuation and whitespace into single hyphens', () => {
    expect(slug('Concentric — circles!!  (v2)')).toBe('concentric-circles-v2');
  });

  it('strips diacritics', () => {
    expect(slug('Régions spéciales')).toBe('regions-speciales');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slug('  ...Untitled...  ')).toBe('untitled');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slug('———')).toBe('');
  });
});

describe('documentFilename', () => {
  it('appends the extension to the slugified title', () => {
    expect(documentFilename('My Design', '.svg', 'background')).toBe(
      'my-design.svg',
    );
  });

  it('falls back to the provided stem for an empty slug', () => {
    expect(documentFilename('!!!', '.py', 'assign_zones')).toBe(
      'assign_zones.py',
    );
  });
});
