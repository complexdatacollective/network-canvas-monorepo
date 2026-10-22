import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import {
  escapeMessageText,
  findMessageSyntaxProblem,
  messageText,
} from '../messageSyntax.ts';

// Weighted towards characters that interact with ICU quoting.
const ALPHABET = [
  '{',
  '}',
  "'",
  "'",
  '<',
  '>',
  '#',
  '|',
  'a',
  'Z',
  ' ',
  '\n',
  'é',
  '😀',
  '\uD800',
];

// Mulberry32: a deterministic generator so a failure reproduces exactly.
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomText = (random: () => number) => {
  const length = Math.floor(random() * 24);
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return text;
};

describe('escapeMessageText', () => {
  it.each([
    ["Don't", "Don't"],
    ['plain text', 'plain text'],
    ['{name}', "'{'name'}'"],
    ['{{', "'{{'"],
    ["'{", "'''{'"],
    ["x{'}y", "x'{''}'y"],
    ["''x", "'''x"],
    ["it's <b>", "it's <b>"],
    ["'<", "''<"],
    ['', ''],
  ])('escapes %j as %j', (text, message) => {
    expect(escapeMessageText(text)).toBe(message);
  });

  it('round-trips through messageText for fuzzed strings', () => {
    const random = createRandom(1475);
    for (let iteration = 0; iteration < 5000; iteration += 1) {
      const text = randomText(random);
      const message = escapeMessageText(text);

      expect(messageText(message), JSON.stringify(text)).toBe(text);
      expect(findMessageSyntaxProblem(message), JSON.stringify(text)).toBe(
        undefined,
      );
      const elements = parse(message, { ignoreTag: true });
      expect(
        elements.every((element) => element.type === TYPE.literal),
        JSON.stringify(text),
      ).toBe(true);
    }
  });
});

describe('messageText', () => {
  it('reads quoted braces and escaped apostrophes as literal text', () => {
    expect(messageText("It''s '{'not a placeholder'}'")).toBe(
      "It's {not a placeholder}",
    );
  });

  it('keeps markup as literal text', () => {
    expect(messageText('Line one<br>Line <b>two</b>')).toBe(
      'Line one<br>Line <b>two</b>',
    );
  });

  it('returns a message with placeholders unchanged', () => {
    expect(messageText('Hello {name}')).toBe('Hello {name}');
  });

  it('returns a message that does not parse unchanged', () => {
    expect(messageText('Hello {')).toBe('Hello {');
  });
});

describe('findMessageSyntaxProblem', () => {
  it('accepts literal text, quoted braces and markup', () => {
    expect(findMessageSyntaxProblem("Don't '{'x'}' <b>bold</b>")).toBe(
      undefined,
    );
  });

  it.each(['Hello {', 'Hello {}', '{a, number, ::}', '{a, foo}'])(
    'rejects the syntax error in %j',
    (message) => {
      expect(findMessageSyntaxProblem(message)).toMatch(
        /not valid message syntax/,
      );
    },
  );

  it.each([
    'Hello {name}',
    '{count, plural, one {# friend} other {# friends}}',
    '{gender, select, female {She} other {They}}',
    '{n, number}',
    '{d, date, short}',
    '{t, time}',
    '{n, selectordinal, one {#st} other {#th}}',
  ])('rejects the non-literal element in %j', (message) => {
    expect(findMessageSyntaxProblem(message)).toMatch(/placeholders/);
  });
});
