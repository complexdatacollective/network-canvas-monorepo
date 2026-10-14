import { parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import {
  type MessageNode,
  messageStructure,
  printMessageStructure,
} from '../messageStructure';

const ast = (message: string) =>
  JSON.stringify(parse(message, { ignoreTag: true, captureLocation: false }));

const roundTrip = (message: string) => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) throw new Error(`unreadable: ${message}`);
  return printMessageStructure(structure.nodes);
};

describe('messageStructure', () => {
  it('reads text, values, switches and the count', () => {
    expect(
      messageStructure(
        "Tell us about {name, select, missing {them} other {{name}}}. It's {n, plural, one {# year} other {# years}}",
      ),
    ).toEqual({
      nodes: [
        { kind: 'text', text: 'Tell us about ' },
        {
          kind: 'switch',
          argument: 'name',
          type: 'select',
          versions: [
            { key: 'missing', nodes: [{ kind: 'text', text: 'them' }] },
            { key: 'other', nodes: [{ kind: 'argument', name: 'name' }] },
          ],
        },
        { kind: 'text', text: ". It's " },
        {
          kind: 'switch',
          argument: 'n',
          type: 'plural',
          versions: [
            {
              key: 'one',
              nodes: [{ kind: 'count' }, { kind: 'text', text: ' year' }],
            },
            {
              key: 'other',
              nodes: [{ kind: 'count' }, { kind: 'text', text: ' years' }],
            },
          ],
        },
      ] satisfies MessageNode[],
    });
  });

  it('reports a message it cannot show', () => {
    expect(messageStructure('{a, select, other {')).toEqual({
      kind: 'unreadable',
    });
    expect(messageStructure('{n, number}')).toEqual({
      kind: 'unsupported',
      argument: 'n',
    });
    expect(
      messageStructure('{n, selectordinal, one {#st} other {#th}}'),
    ).toEqual({ kind: 'unsupported', argument: 'n' });
  });

  it.each([
    'Plain text',
    "Don't stop",
    "Braces '{like this}' and an apostrophe '' before one",
    "'{'{name}'}'",
    "A literal '{'name'}' beside {name}",
    '{n, plural, offset:1 =0 {nobody} one {# and you} other {# others}}',
    "{n, plural, one {'#' is # ''} other {# '{'braces'}'}}",
    '{a, select, x {{n, plural, one {# {a}} other {#}}} other {none}}',
    "<b>tags</b> and 'quotes' stay '<'text'>'",
    '**Hello {name}**, [your page](https://example.com/{name})',
  ])('prints %s back to the same message', (message) => {
    expect(ast(roundTrip(message))).toBe(ast(message));
  });

  it('quotes text so that it stays text', () => {
    const nodes: MessageNode[] = [
      { kind: 'text', text: "{name} isn't # '" },
      {
        kind: 'switch',
        argument: 'n',
        type: 'plural',
        versions: [
          { key: 'other', nodes: [{ kind: 'text', text: "# '#' {x}" }] },
        ],
      },
    ];
    const printed = printMessageStructure(nodes);
    expect(messageStructure(printed)).toEqual({ nodes });
  });

  it('leaves # unquoted in a select within a plural, where it is text', () => {
    // ICU reads `#` as the number only directly in a plural's versions; in a
    // select inside one it is text, and a quote there would show.
    const nodes: MessageNode[] = [
      {
        kind: 'switch',
        argument: 'n',
        type: 'plural',
        versions: [
          {
            key: 'other',
            nodes: [
              {
                kind: 'switch',
                argument: 'k',
                type: 'select',
                versions: [
                  { key: 'a', nodes: [{ kind: 'text', text: "No. # isn't" }] },
                  { key: 'other', nodes: [{ kind: 'text', text: 'z' }] },
                ],
              },
            ],
          },
        ],
      },
    ];
    const printed = printMessageStructure(nodes);
    expect(printed).toBe(
      "{n, plural, other {{k, select, a {No. # isn't} other {z}}}}",
    );
    expect(messageStructure(printed)).toEqual({ nodes });
  });
});
