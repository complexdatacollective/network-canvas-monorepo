import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  isPresentationalText,
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from './PresentationalText';

const arabic: PresentationalText = { text: 'نعم', lang: 'ar', dir: 'rtl' };

describe('isPresentationalText', () => {
  it('accepts a plain string and a complete attributed text', () => {
    expect(isPresentationalText('Yes')).toBe(true);
    expect(isPresentationalText('')).toBe(true);
    expect(isPresentationalText(arabic)).toBe(true);
    expect(isPresentationalText({ text: 'Yes', lang: 'en', dir: 'ltr' })).toBe(
      true,
    );
  });

  it('rejects React nodes and incomplete or mistyped objects', () => {
    expect(isPresentationalText(createElement('em', null, 'Yes'))).toBe(false);
    expect(isPresentationalText(['Yes'])).toBe(false);
    expect(isPresentationalText(null)).toBe(false);
    expect(isPresentationalText(undefined)).toBe(false);
    expect(isPresentationalText(7)).toBe(false);
    expect(isPresentationalText({ text: 'Yes', lang: 'en' })).toBe(false);
    expect(isPresentationalText({ text: 'Yes', dir: 'ltr' })).toBe(false);
    expect(isPresentationalText({ lang: 'en', dir: 'ltr' })).toBe(false);
    expect(isPresentationalText({ text: 'Yes', lang: 'en', dir: 'auto' })).toBe(
      false,
    );
    expect(isPresentationalText({ text: 1, lang: 'en', dir: 'ltr' })).toBe(
      false,
    );
  });
});

describe('presentationalTextValue', () => {
  it('returns a plain string unchanged', () => {
    expect(presentationalTextValue('**Yes**')).toBe('**Yes**');
  });

  it('returns the text of an attributed text', () => {
    expect(presentationalTextValue(arabic)).toBe('نعم');
  });
});

describe('presentationalTextProps', () => {
  it('returns the language and direction of an attributed text', () => {
    expect(presentationalTextProps(arabic)).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  it('adds nothing for a plain string, a React node or no value', () => {
    expect(presentationalTextProps('Yes')).toEqual({});
    expect(presentationalTextProps(createElement('em', null, 'Yes'))).toEqual(
      {},
    );
    expect(presentationalTextProps(undefined)).toEqual({});
  });
});
