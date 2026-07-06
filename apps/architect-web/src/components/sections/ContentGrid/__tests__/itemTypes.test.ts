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

  it('keeps a real display size on an asset item', () => {
    const result = normalizeType({
      id: '1',
      content: 'asset-1',
      type: 'image',
      size: 'MEDIUM',
    });
    expect(result).toEqual({
      id: '1',
      content: 'asset-1',
      type: 'asset',
      size: 'MEDIUM',
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
});
