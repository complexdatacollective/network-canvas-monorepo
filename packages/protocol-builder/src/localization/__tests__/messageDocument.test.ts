import { describe, expect, it } from 'vitest';

import {
  messageStructure,
  printMessageStructure,
} from '@codaco/protocol-validation';

import {
  countTokenId,
  documentToMessageNodes,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
  MessageDocumentProblem,
  messageToDocument,
} from '../messageDocument';

const labels: MessageDocumentLabels = {
  switchLabel: (node) => `By ${node.argument}`,
  switchSummary: (node) => node.argument,
  versionLabel: (node, key) => `${node.argument} ${key}`,
};

const MARKDOWN: MessageDocumentFormat = { markdown: true, singleLine: false };
const MARKDOWN_LINE: MessageDocumentFormat = {
  markdown: true,
  singleLine: true,
};
const PLAIN: MessageDocumentFormat = { markdown: false, singleLine: true };

const ast = (message: string) => messageStructure(message);

const roundTrip = (message: string, format: MessageDocumentFormat) => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) throw new Error('unreadable');
  const document = messageToDocument(structure.nodes, format, labels);
  return printMessageStructure(documentToMessageNodes(document, format));
};

describe('messageToDocument', () => {
  it('reads text starting a version as part of the line', () => {
    const structure = messageStructure(
      'A {kind, select, a {# one} other {- two}}',
    );
    if (!('nodes' in structure)) throw new Error('unreadable');
    const document = messageToDocument(structure.nodes, MARKDOWN_LINE, labels);
    const versions = document.content?.[0]?.content?.[1]?.attrs?.versions as {
      content: unknown;
    }[];
    expect(versions.map((version) => version.content)).toEqual([
      [{ type: 'text', text: '# one' }],
      [{ type: 'text', text: '- two' }],
    ]);
  });

  it('shows values as placeholders and switches as versions', () => {
    const structure = messageStructure(
      'Tell us about **{name, select, missing {this person} other {{name}}}**.',
    );
    if (!('nodes' in structure)) throw new Error('unreadable');
    expect(messageToDocument(structure.nodes, MARKDOWN_LINE, labels)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Tell us about ' },
            {
              type: 'versions',
              marks: [{ type: 'bold' }],
              attrs: {
                label: 'By name',
                summary: 'name',
                meta: { argument: 'name', type: 'select' },
                // The version that shows the value comes first, the one for
                // when it is missing last.
                versions: [
                  {
                    key: 'other',
                    label: 'name other',
                    content: [{ type: 'token', attrs: { id: 'name' } }],
                  },
                  {
                    key: 'missing',
                    label: 'name missing',
                    content: [{ type: 'text', text: 'this person' }],
                  },
                ],
              },
            },
            { type: 'text', text: '.' },
          ],
        },
      ],
    });
  });

  it('shows the version for a missing value last, after each answer’s, and records it first', () => {
    const message =
      'Hi{kind, select, missing {} a {, A} b {, B} other {, someone}}!';
    const structure = messageStructure(message);
    if (!('nodes' in structure)) throw new Error('unreadable');
    const document = messageToDocument(structure.nodes, PLAIN, labels);
    const versions = document.content?.[0]?.content?.[1]?.attrs?.versions as {
      key: string;
    }[];
    expect(versions.map(({ key }) => key)).toEqual([
      'a',
      'b',
      'other',
      'missing',
    ]);
    // Written back as the message had it, so opening a text never reorders
    // what it says.
    expect(roundTrip(message, PLAIN)).toBe(message);
  });

  it('refuses a value inside a link address', () => {
    const structure = messageStructure(
      '[Your page](https://example.com/{name})',
    );
    if (!('nodes' in structure)) throw new Error('unreadable');
    expect(() => messageToDocument(structure.nodes, MARKDOWN, labels)).toThrow(
      MessageDocumentProblem,
    );
  });

  it.each([
    '{kind, select, a {First paragraph\n\nSecond paragraph} other {none}}',
    '{kind, select, a {Some\n- one\n- two} other {none}}',
    'Intro\n\n{n, plural, one {## One} other {Many\n\n## Heading}}',
  ])(
    'refuses a version of markdown that runs over more than one line: %s',
    (message) => {
      const structure = messageStructure(message);
      if (!('nodes' in structure)) throw new Error('unreadable');
      expect(() =>
        messageToDocument(structure.nodes, MARKDOWN, labels),
      ).toThrow(expect.objectContaining({ kind: 'linesInVersion' }));
    },
  );

  it('still reads a markdown document whose versions are one line each', () => {
    const structure = messageStructure(
      '# Title\n\n{kind, select, a {**one**} other {two}}\n\n- item',
    );
    if (!('nodes' in structure)) throw new Error('unreadable');
    expect(() =>
      messageToDocument(structure.nodes, MARKDOWN, labels),
    ).not.toThrow();
  });
});

describe('a message through the editor and back', () => {
  it.each([
    'Plain words',
    'Hello {name}, welcome back.',
    // Written as the editor writes markdown, so the text compares equal.
    '**Hello {name}**, and _you_.',
    "Braces '{like this}' and it's {name}'s",
    'Tell us about {name, select, missing {this person} other {{name}}}.',
    '{name, select, missing {Welcome} other {Welcome, **{name}**}}',
    'We{n, plural, one { have # friend} other { have # friends}} here',
    '{n, plural, offset:1 =0 {nobody} one {just you} other {you and # others}}',
    '{kind, select, a {{n, plural, one {# {name}} other {# people}}} other {none}}',
    'A [link](https://example.com) beside {name}',
    // Text starting a version is mid-line, not a heading or a list.
    '{kind, select, a {\\# 1. **first**} other {\\- none}}',
  ])('keeps the markdown message %s', (message) => {
    expect(ast(roundTrip(message, MARKDOWN_LINE))).toEqual(ast(message));
  });

  it('keeps a markdown document with blocks', () => {
    const message =
      '# Hello {name}\n\n- one {n, plural, one {#} other {# more}}\n- two';
    expect(ast(roundTrip(message, MARKDOWN))).toEqual(ast(message));
  });

  it.each([
    'A *plain* title for {name}',
    "Plain {name, select, missing {nobody} other {{name}'s}} braces '{'",
    // Markdown would write a `#` before a space as `\#`, which reads the
    // same; plain text keeps it, so the ICU quoting is what is compared.
    "{n, plural, one {'#' means # ''} other {'{'#'}'}}",
  ])('keeps the plain message %s', (message) => {
    expect(ast(roundTrip(message, PLAIN))).toEqual(ast(message));
  });
});

describe('a count pill outside its plural', () => {
  // ICU reads `#` as the number only directly inside a plural's version: at
  // the top level, or inside a select (even one within that plural), it is
  // literal text. A count pill pasted there keeps its value instead.
  const countPill = (argument: string) => ({
    type: 'token',
    attrs: { id: countTokenId(argument) },
  });
  const line = (...content: Record<string, unknown>[]) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  });
  const versionsOf = (
    argument: string,
    type: 'select' | 'plural',
    versions: Record<string, readonly Record<string, unknown>[]>,
  ) => ({
    type: 'versions',
    attrs: {
      label: argument,
      meta: { argument, type },
      versions: Object.entries(versions).map(([key, content]) => ({
        key,
        label: key,
        content,
      })),
    },
  });

  it('prints a pill pasted at the top level as the value', () => {
    const document = line({ type: 'text', text: 'You have ' }, countPill('n'));
    expect(
      printMessageStructure(documentToMessageNodes(document, MARKDOWN_LINE)),
    ).toBe('You have {n}');
  });

  it('prints a pill in a select within the plural as the value', () => {
    const document = line(
      versionsOf('n', 'plural', {
        other: [
          versionsOf('kind', 'select', {
            a: [countPill('n')],
            other: [{ type: 'text', text: 'none' }],
          }),
        ],
      }),
    );
    const printed = printMessageStructure(
      documentToMessageNodes(document, PLAIN),
    );
    expect(ast(printed)).toEqual(
      ast('{n, plural, other {{kind, select, a {{n}} other {none}}}}'),
    );
  });

  it('prints a pill in a different plural as that value', () => {
    const document = line(
      versionsOf('m', 'plural', { other: [countPill('n')] }),
    );
    expect(
      ast(printMessageStructure(documentToMessageNodes(document, PLAIN))),
    ).toEqual(ast('{m, plural, other {{n}}}'));
  });

  it('prints a pill directly in its own plural as #', () => {
    const document = line(
      versionsOf('n', 'plural', {
        other: [countPill('n'), { type: 'text', text: ' friends' }],
      }),
    );
    expect(printMessageStructure(documentToMessageNodes(document, PLAIN))).toBe(
      '{n, plural, other {# friends}}',
    );
  });
});
