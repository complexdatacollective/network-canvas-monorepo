import { describe, expect, it } from 'vitest';

import { isBlankMessage, isBlankText } from '../blankText.ts';
import { escapeMessageText } from '../messageSyntax.ts';

describe('isBlankText', () => {
  it.each([
    ['empty text', ''],
    ['spaces', '   '],
    ['tabs and line breaks', '\t\r\n'],
    ['non-breaking and ideographic spaces', ' 　'],
    ['zero-width characters', '​‌‍﻿'],
    ['a soft hyphen', '­'],
  ])('treats %s as blank', (_name, text) => {
    expect(isBlankText(text)).toBe(true);
  });

  it.each([
    ['a word', 'Age'],
    ['a word with spaces around it', '  Age  '],
    ['punctuation alone', '?'],
    ['a letter from another script', '年'],
  ])('does not treat %s as blank', (_name, text) => {
    expect(isBlankText(text)).toBe(false);
  });
});

describe('isBlankMessage', () => {
  it('reads a message as the text it makes', () => {
    expect(isBlankMessage("' '")).toBe(false);
    expect(isBlankMessage(escapeMessageText('  '))).toBe(true);
    expect(isBlankMessage(escapeMessageText(' { } '))).toBe(false);
  });

  it('treats a message that does not parse by its own characters', () => {
    expect(isBlankMessage('  {')).toBe(false);
  });
});
