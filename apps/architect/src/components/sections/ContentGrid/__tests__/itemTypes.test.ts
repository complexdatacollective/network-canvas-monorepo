import { describe, expect, it } from 'vitest';

import { normalizeType } from '../itemTypes';

describe('normalizeType', () => {
  it('collapses a text item to the text discriminant', () => {
    const result = normalizeType({ id: '1', content: 'Hello', type: 'text' });
    expect(result).toEqual({ id: '1', content: 'Hello', type: 'text' });
  });

  it('strips a stray size from a text item so it stays schema-valid', () => {
    const result = normalizeType({
      id: '1',
      content: 'Hello',
      type: 'text',
      size: 'SMALL',
    });
    expect(result).not.toHaveProperty('size');
    expect(result).toEqual({ id: '1', content: 'Hello', type: 'text' });
  });

  it.each(['image', 'video', 'audio'])(
    'collapses a %s item to the asset discriminant',
    (type: string) => {
      const result = normalizeType({ id: '1', content: 'asset-1', type });
      expect(result.type).toBe('asset');
    },
  );

  it.each(['image', 'video'])(
    'keeps a real display size on a %s item',
    (type: string) => {
      const result = normalizeType({
        id: '1',
        content: 'asset-1',
        type,
        size: 'MEDIUM',
      });
      expect(result).toEqual({
        id: '1',
        content: 'asset-1',
        type: 'asset',
        size: 'MEDIUM',
      });
    },
  );

  it('strips a stray size from an audio item since audio is not sizeable', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'audio',
      size: 'SMALL',
    });
    expect(result).not.toHaveProperty('size');
    expect(result.type).toBe('asset');
  });

  it('keeps a valid size on the ambiguous "asset" fallback (unresolved ref)', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'asset',
      size: 'LARGE',
    });
    expect(result).toEqual({
      id: '1',
      content: 'asset-1',
      type: 'asset',
      size: 'LARGE',
    });
  });

  it('drops an empty "Full size" value so no size key is persisted', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'video',
      size: '',
    });
    expect(result).not.toHaveProperty('size');
    expect(result).toEqual({ id: '1', content: 'asset-1', type: 'asset' });
  });

  it.each(['small', 'HUGE', 'medium '])(
    'drops a size (%j) outside the schema enum',
    (size: string) => {
      const result = normalizeType({
        id: '1',
        content: 'asset-1',
        type: 'image',
        size,
      });
      expect(result).not.toHaveProperty('size');
    },
  );

  it('drops a non-string size value', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'image',
      size: 2,
    });
    expect(result).not.toHaveProperty('size');
  });
});
