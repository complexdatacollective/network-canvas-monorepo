import { describe, expect, it } from 'vitest';

import { createEventStreamParser } from '../eventStream';

describe('createEventStreamParser', () => {
  it('reassembles events split anywhere, across lines, CRLF and comments', () => {
    const received: string[] = [];
    const parser = createEventStreamParser((data) => received.push(data));
    const text =
      ': keep-alive\r\ndata: {"a":1}\r\n\r\nevent: x\ndata: one\ndata: two\n\ndata:{"b":2}\n\n';
    // Every split point, one character at a time.
    for (const character of text) parser.push(character);
    parser.end();
    expect(received).toEqual(['{"a":1}', 'one\ntwo', '{"b":2}']);
  });

  it('counts a last event that has no closing blank line', () => {
    const received: string[] = [];
    const parser = createEventStreamParser((data) => received.push(data));
    parser.push('data: last');
    parser.end();
    expect(received).toEqual(['last']);
  });
});
