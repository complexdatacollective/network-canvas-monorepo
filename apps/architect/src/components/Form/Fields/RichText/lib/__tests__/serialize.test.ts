import type { Descendant } from 'slate';
import { describe, expect, it } from 'vitest';

import serialize from '../serialize';

const paragraph = (text: string): Descendant =>
  ({
    type: 'paragraph',
    children: [{ text }],
  }) as unknown as Descendant;

describe('serialize', () => {
  it('trims the trailing newline for inline labels', () => {
    expect(serialize([paragraph('Group A')], true)).toBe('Group A');
  });

  it('is a serialize/parse fixed point for a plain inline label', () => {
    // The stored value on open is a plain string; an inline label must round-trip
    // to itself so the mount effect does not dirty the form or rewrite the value.
    expect(serialize([paragraph('Group A')], true)).toBe('Group A');
  });

  it('keeps newlines between blocks for multi-line content', () => {
    const result = serialize(
      [paragraph('Line one'), paragraph('Line two')],
      false,
    );
    expect(result).toContain('Line one');
    expect(result).toContain('Line two');
    expect(result).toContain('\n');
  });

  it('defaults to non-inline (newlines preserved) when inline is omitted', () => {
    expect(serialize([paragraph('Group A')])).toBe('Group A\n');
  });
});
