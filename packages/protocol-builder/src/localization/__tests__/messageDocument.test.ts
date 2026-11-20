import { describe, expect, it } from 'vitest';

import { suppliedStageText } from '@codaco/interview/supplied-wording';
import {
  anonymisationStage,
  messageStructure,
  printMessageStructure,
} from '@codaco/protocol-validation';

import {
  countTokenId,
  documentToMessageNodes,
  type IfBlockLabels,
  ifBlockAttributes,
  ifBlockRowsIn,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
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

  // What validation says of `message` as formatted stage text, read through
  // a stage's own schema.
  const refusalsOf = (message: string): string[] => {
    const result = anonymisationStage.shape.explanationText.safeParse({
      en: message,
    });
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.message);
  };

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
      expect(refusalsOf(message)).toEqual([
        expect.stringMatching(/cannot contain a line break/),
      ]);
    },
  );

  it.each([
    '[Your page](https://example.com/{name})',
    '[Your page](https://example.com "For {name}")',
    '{kind, select, a {[you](https://example.com/{name})} other {none}}',
    '[Your page](https://example.com/{kind, select, a {one} other {two}})',
    // Read as the editor reads it: a version without the spaces at its ends,
    // and a `>` as text, so neither an indent nor a tag hides the link.
    '{kind, select, a {    [you](https://example.com/{name})} other {none}}',
    '{kind, select, a {\t[you](https://example.com/{name})} other {none}}',
    '<span title="[you](https://example.com/{name})">',
    '<div>\n[you](https://example.com/{name})\n</div>',
  ])(
    'refuses a value inside a link address, as validation does: %s',
    (message) => {
      const structure = messageStructure(message);
      if (!('nodes' in structure)) throw new Error('unreadable');
      expect(() =>
        messageToDocument(structure.nodes, MARKDOWN, labels),
      ).toThrow(expect.objectContaining({ kind: 'valueInLinkAddress' }));
      expect(refusalsOf(message)).toEqual([
        expect.stringMatching(/link address cannot contain a value/),
      ]);
    },
  );

  it.each([
    '[Page for {name}](https://example.com) and {name}',
    'Hello\n\n{kind, select, a {**one**} other {[two](https://example.com)}}',
  ])('holds a text validation accepts: %s', (message) => {
    const structure = messageStructure(message);
    if (!('nodes' in structure)) throw new Error('unreadable');
    expect(refusalsOf(message)).toEqual([]);
    expect(() =>
      messageToDocument(structure.nodes, MARKDOWN, labels),
    ).not.toThrow();
  });

  it('still reads a markdown document whose versions are one line each', () => {
    const message =
      '# Title\n\n{kind, select, a {**one**} other {two}}\n\n- item';
    expect(ast(roundTrip(message, MARKDOWN))).toEqual(ast(message));
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

describe('the wording Network Canvas supplies, through the editor and back', () => {
  // Every language the supplied wording is written in.
  const LOCALES = [
    'en',
    'de',
    'es',
    'fr',
    'it',
    'nl',
    'pt-BR',
    'zh-Hans',
    'zh-Hant',
  ];
  // The stages whose supplied wording holds placeholders and versions,
  // which the stage editor edits one line at a time.
  const texts = [
    'FamilyPedigree',
    'NarrativePedigree',
    'NameGenerator',
    'NameGeneratorQuickAdd',
    'NameGeneratorRoster',
  ].flatMap((stageType) =>
    suppliedStageText(stageType, {
      defaultLocale: 'en',
      locales: LOCALES,
    }).flatMap(({ path, value }) =>
      Object.entries(value)
        .filter(([, message]) => message.includes('{'))
        .map(([locale, message]) => ({
          name: `${stageType} ${path.join('.')} (${locale})`,
          message,
        })),
    ),
  );

  it('finds the texts with versions', () => {
    expect(texts.length).toBeGreaterThan(400);
  });

  it('keeps every one as it is written', () => {
    const changed = texts
      .filter(({ message }) => {
        const kept = ast(roundTrip(message, PLAIN));
        return JSON.stringify(kept) !== JSON.stringify(ast(message));
      })
      .map(({ name }) => name);
    expect(changed).toEqual([]);
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

describe('an "If" on a condition', () => {
  const block: IfBlockLabels = {
    is: (node) =>
      node.type === 'select' &&
      node.argument.startsWith('if') &&
      node.versions.length === 2,
    label: (rows) => `If ${rows[0]?.argument}`,
    summary: (rows) => `If ${rows[0]?.argument}`,
    rowLabel: (row, index) =>
      `${index === 0 ? 'If' : 'Else if'} ${row.argument} ${row.key}`,
    otherwiseLabel: 'Otherwise',
    rowAction: 'Edit rules',
    rowRemovable: 'Remove',
    actions: [{ id: 'addElseIf', label: 'Add else if' }],
  };
  const withIf: MessageDocumentLabels = { ...labels, ifBlock: block };
  const versionsOf = (message: string) => {
    const structure = messageStructure(message);
    if (!('nodes' in structure)) throw new Error('unreadable');
    const document = messageToDocument(structure.nodes, PLAIN, withIf);
    const element = document.content?.[0]?.content?.find(
      (node) => node.type === 'versions',
    );
    const attrs = element?.attrs;
    const listed: unknown = attrs?.versions;
    const versions = (Array.isArray(listed) ? listed : []).filter(isVersion);
    return { document, attrs, versions };
  };
  const isVersion = (
    value: unknown,
  ): value is {
    key: string;
    label: string;
    content: Record<string, unknown>[];
    removable?: string;
  } =>
    typeof value === 'object' &&
    value !== null &&
    'key' in value &&
    typeof value.key === 'string' &&
    'label' in value &&
    typeof value.label === 'string' &&
    'content' in value &&
    Array.isArray(value.content);
  const CHAIN =
    'A {if1, select, yes {one} other {{if2, select, no {two} other {three}}}} B';

  it('lists each "else if" the text nests as a row of the one "If"', () => {
    const { attrs, versions } = versionsOf(CHAIN);
    expect(
      versions.map((version) => `${version.key}=${version.label}`),
    ).toEqual([
      'if:if1:yes=If if1 yes',
      'if:if2:no=Else if if2 no',
      'other=Otherwise',
    ]);
    expect(attrs?.variant).toBe('logic');
    expect(attrs?.actions).toEqual([{ id: 'addElseIf', label: 'Add else if' }]);
  });

  it('writes the rows back as the nesting they were read from', () => {
    const { document } = versionsOf(CHAIN);
    expect(printMessageStructure(documentToMessageNodes(document, PLAIN))).toBe(
      CHAIN,
    );
  });

  it('keeps an "If" inside a version as an "If" of its own, not a row', () => {
    const nested =
      '{if1, select, yes {x {if2, select, yes {y} other {z}}} other {w}}';
    const { document, versions } = versionsOf(nested);
    expect(versions).toHaveLength(2);
    expect(printMessageStructure(documentToMessageNodes(document, PLAIN))).toBe(
      nested,
    );
  });

  it('offers to remove a row only while another row would be left', () => {
    const one = versionsOf('{if1, select, yes {a} other {b}}').versions;
    expect(one[0]).not.toHaveProperty('removable');
    expect(versionsOf(CHAIN).versions[0]).toHaveProperty('removable', 'Remove');
  });

  it('rewrites the element when a row is removed, renaming the rows left', () => {
    const { versions } = versionsOf(CHAIN);
    const { rows, otherwise } = ifBlockRowsIn({ versions });
    const rewritten = ifBlockAttributes(rows.slice(1), otherwise, block);
    expect(rewritten.versions.map((version) => version.label)).toEqual([
      'If if2 no',
      'Otherwise',
    ]);
    expect(
      printMessageStructure(
        documentToMessageNodes(
          {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'versions', attrs: rewritten }],
              },
            ],
          },
          PLAIN,
        ),
      ),
    ).toBe('{if2, select, no {two} other {three}}');
  });

  // An "If" is a select, and ICU reads `#` as a plural's number only
  // directly inside that plural's version: a count pill pasted into a row
  // of an "If" within the plural keeps its value.
  it('prints a count pill in a row of an "If" within its plural as the value', () => {
    const inIf = ifBlockAttributes(
      [
        {
          argument: 'if1',
          key: 'yes',
          content: [{ type: 'token', attrs: { id: countTokenId('n') } }],
        },
      ],
      [{ type: 'text', text: 'none' }],
      block,
    );
    const document = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'versions',
              attrs: {
                label: 'n',
                meta: { argument: 'n', type: 'plural' },
                versions: [
                  {
                    key: 'other',
                    label: 'other',
                    content: [{ type: 'versions', attrs: inIf }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(printMessageStructure(documentToMessageNodes(document, PLAIN))).toBe(
      '{n, plural, other {{if1, select, yes {{n}} other {none}}}}',
    );
  });

  it('leaves a switch that is not an "If" as the versions it has', () => {
    const { attrs, versions } = versionsOf('{kind, select, a {x} other {y}}');
    expect(versions.map((version) => version.key)).toEqual(['a', 'other']);
    expect(attrs?.variant).toBeUndefined();
  });
});
