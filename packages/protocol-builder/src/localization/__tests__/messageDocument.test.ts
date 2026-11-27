import { describe, expect, it } from 'vitest';

import { suppliedStageText } from '@codaco/interview/supplied-wording';
import {
  dynamicValueNameFor,
  fieldBlockMarkdown,
  messageStructure,
  optionCaseKey,
  printMessageStructure,
  readContentDocument,
} from '@codaco/protocol-validation';

import type { RichTextContent } from '../../markdown/markdownAdapter';
import {
  countTokenId,
  documentToMessage,
  documentToMessageNodes,
  fieldBlockNodeOf,
  type FieldText,
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

const DOCUMENT: MessageDocumentFormat = {
  markdown: true,
  singleLine: false,
  assetBlocks: true,
};
const MARKDOWN_LINE: MessageDocumentFormat = {
  markdown: true,
  singleLine: true,
};
const PLAIN: MessageDocumentFormat = { markdown: false, singleLine: true };

const ast = (message: string) => messageStructure(message);

/** The message, through the editor and back, as researcher text. */
const roundTrip = (
  message: string,
  format: MessageDocumentFormat,
  fieldText?: (fieldId: string) => FieldText | undefined,
) =>
  documentToMessage(
    messageToDocument(message, format, {
      ...(fieldText !== undefined && { fieldText }),
    }),
    format,
  );

/** The message, through the editor and back, as supplied wording. */
const suppliedRoundTrip = (message: string, format: MessageDocumentFormat) =>
  printMessageStructure(
    documentToMessageNodes(
      messageToDocument(message, format, { versions: labels }),
      format,
    ),
  );

const problemOf = (message: string, format: MessageDocumentFormat) => {
  try {
    messageToDocument(message, format);
  } catch (error) {
    if (error instanceof MessageDocumentProblem) return error.kind;
    throw error;
  }
  return undefined;
};

const COND_A = '11111111-1111-4111-8111-111111111111';
const COND_B = '22222222-2222-4222-8222-222222222222';
/** The names that text uses for the conditions `COND_A` and `COND_B`. */
const CONDITION_A = dynamicValueNameFor({
  kind: 'condition',
  conditionId: COND_A,
});
const CONDITION_B = dynamicValueNameFor({
  kind: 'condition',
  conditionId: COND_B,
});
const DYNAMIC_A = dynamicValueNameFor({ kind: 'dynamicAttribute', id: COND_A });
const GENDER = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: '33333333-3333-4333-8333-333333333333',
});
const AGE = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: '44444444-4444-4444-8444-444444444444',
});
const IS_PARTICIPANT = dynamicValueNameFor({
  kind: 'participant',
  role: 'node',
});
const WOMAN = optionCaseKey('55555555-5555-4555-8555-555555555555');
const MAN = optionCaseKey('66666666-6666-4666-8666-666666666666');
const FIELD_1 = '77777777-7777-4777-8777-777777777777';
const FIELD_2 = '88888888-8888-4888-8888-888888888888';

describe('researcher text of one line', () => {
  it('shows each value as an inline value', () => {
    expect(
      messageToDocument('Tell us about **{name}**.', MARKDOWN_LINE),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Tell us about ' },
            {
              type: 'inlineValue',
              attrs: { id: 'name' },
              marks: [{ type: 'bold' }],
            },
            { type: 'text', text: '.' },
          ],
        },
      ],
    });
  });

  it.each([
    'Plain words',
    'Hello {name}, welcome back.',
    '**Hello {name}**, and _you_.',
    "Braces '{like this}' and it's {name}'s",
    'A [link](https://example.com) beside {name}',
    `Ask about {${DYNAMIC_A}} work`,
  ])('keeps the markdown message %s', (message) => {
    expect(ast(roundTrip(message, MARKDOWN_LINE).message ?? '')).toEqual(
      ast(message),
    );
  });

  it('keeps plain text', () => {
    const message = "A *plain* title for {name} with braces '{'";
    expect(ast(roundTrip(message, PLAIN).message ?? '')).toEqual(ast(message));
  });

  it('refuses a choice of versions inside the line', () => {
    expect(
      problemOf(
        'Tell us about {name, select, missing {this person} other {{name}}}.',
        MARKDOWN_LINE,
      ),
    ).toBe('inlineChoice');
  });

  it('writes an empty line as no message', () => {
    expect(
      documentToMessage(
        { type: 'doc', content: [{ type: 'paragraph' }] },
        MARKDOWN_LINE,
      ).message,
    ).toBeUndefined();
  });
});

describe('researcher text of several lines', () => {
  it.each([
    ['blocks with values', '# Hello {name}\n\n- one\n- two {name}'],
    [
      'a conditions logic block',
      `Before\n\n{${CONDITION_A}, select, true {Shown when met} other {Otherwise this}}\n\nAfter`,
    ],
    [
      'an "If not" logic block',
      `{${CONDITION_A}, select, false {Not met} other {Met}}`,
    ],
    [
      'else-if rows',
      `{${CONDITION_A}, select, true {First} other {{${CONDITION_B}, select, false {Second} other {Third}}}}`,
    ],
    [
      'an answers logic block',
      `{${GENDER}, select, missing {Unknown} ${WOMAN} {# Her\n\nwords} ${MAN} {His} other {Theirs}}`,
    ],
    [
      'a number logic block',
      `{${AGE}, select, missing {No age} other {{${AGE}, plural, one {One year} other {{${AGE}} years}}}}`,
    ],
    [
      'a participant logic block',
      `{${IS_PARTICIPANT}, select, true {You} other {Them}}`,
    ],
    [
      'a logic block nested in a branch',
      `{${CONDITION_A}, select, true {Outer\n\n{${IS_PARTICIPANT}, select, true {You} other {Them}}} other {}}`,
    ],
    ['empty branches', `{${CONDITION_A}, select, true {} other {}}\n\nAfter`],
    [
      'an asset block in a branch',
      `{${CONDITION_A}, select, true {![A map](asset:a1)} other {Words}}`,
    ],
  ])('keeps %s', (_name, message) => {
    expect(roundTrip(message, DOCUMENT).message).toBe(message);
  });

  it('reads a logic block as a block with a branch for each version', () => {
    const document = messageToDocument(
      `{${CONDITION_A}, select, true {Met} other {{${CONDITION_B}, select, false {Not B} other {}}}}`,
      DOCUMENT,
    );
    expect(document.content).toEqual([
      {
        type: 'logicBlock',
        attrs: { meta: { kind: 'conditions' } },
        content: [
          {
            type: 'logicBranch',
            attrs: {
              key: `row:${COND_A}`,
              meta: { conditionId: COND_A, when: 'met' },
            },
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Met' }] },
            ],
          },
          {
            type: 'logicBranch',
            attrs: {
              key: `row:${COND_B}`,
              meta: { conditionId: COND_B, when: 'notMet' },
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Not B' }],
              },
            ],
          },
          {
            type: 'logicBranch',
            attrs: { key: 'otherwise', meta: null },
            content: [{ type: 'paragraph' }],
          },
        ],
      },
    ]);
  });

  it('keeps a literal # in a number branch, as text', () => {
    const message = `{${AGE}, select, missing {} other {{${AGE}, plural, one {'#' Heading} other {Many}}}}`;
    const { message: written } = roundTrip(message, DOCUMENT);
    expect(written).toBe(message);
    const reading = readContentDocument(written ?? '');
    expect(reading.problems).toEqual([]);
  });

  it('shows the count of a number branch as the value it is on', () => {
    const document = messageToDocument(
      `{${AGE}, select, missing {} other {{${AGE}, plural, other {# years}}}}`,
      DOCUMENT,
    );
    const branch = document.content?.[0]?.content?.[1];
    expect(branch?.content?.[0]?.content?.[0]).toEqual({
      type: 'inlineValue',
      attrs: { id: AGE },
    });
    expect(roundTrip(messageStructureText(document), DOCUMENT).message).toBe(
      `{${AGE}, select, missing {} other {{${AGE}, plural, other {{${AGE}} years}}}}`,
    );
  });

  it('refuses a choice inside a sentence', () => {
    expect(
      problemOf(`Hello {${CONDITION_A}, select, true {a} other {b}}`, DOCUMENT),
    ).toBe('inlineChoice');
  });

  it('refuses a whole-block choice of no logic shape', () => {
    expect(problemOf('{kind, select, a {A} other {B}}', DOCUMENT)).toBe(
      'unreadableDocument',
    );
  });

  it('writes a document of nothing as no message', () => {
    expect(
      documentToMessage(
        { type: 'doc', content: [{ type: 'paragraph' }] },
        DOCUMENT,
      ).message,
    ).toBeUndefined();
  });
});

describe('a form document', () => {
  const fields: Record<string, FieldText> = {
    [FIELD_1]: {
      variable: 'v1',
      showValidationHints: true,
      prompt: 'How old is **{node_label}**?',
      hint: 'In years',
    },
    [FIELD_2]: { variable: 'v2', showValidationHints: false },
  };
  const fieldText = (fieldId: string) => fields[fieldId];
  const message = [
    '# About you',
    fieldBlockMarkdown(FIELD_1),
    `{${CONDITION_A}, select, true {${fieldBlockMarkdown(FIELD_2)}} other {}}`,
  ].join('\n\n');

  it('shows each field as a block with its question and hint', () => {
    const document = messageToDocument(message, DOCUMENT, { fieldText });
    expect(document.content?.[1]).toEqual({
      type: 'fieldBlock',
      attrs: { fieldId: FIELD_1, variable: 'v1', showValidationHints: true },
      content: [
        {
          type: 'fieldLabel',
          content: [
            { type: 'text', text: 'How old is ' },
            {
              type: 'inlineValue',
              attrs: { id: 'node_label' },
              marks: [{ type: 'bold' }],
            },
            { type: 'text', text: '?' },
          ],
        },
        { type: 'fieldHint', content: [{ type: 'text', text: 'In years' }] },
      ],
    });
  });

  it('gives the block of one field, as the document shows it', () => {
    const field = fieldText(FIELD_1);
    expect(field).toBeDefined();
    expect(field && fieldBlockNodeOf(FIELD_1, field)).toEqual(
      messageToDocument(message, DOCUMENT, { fieldText }).content?.[1],
    );
  });

  it('writes the document back, with the text of each field beside it', () => {
    const written = roundTrip(message, DOCUMENT, fieldText);
    expect(written.message).toBe(message);
    expect(Object.fromEntries(written.fieldTexts)).toEqual(fields);
  });

  it('shows a field that the form does not list as an indeterminate block', () => {
    const document = messageToDocument(
      fieldBlockMarkdown(FIELD_2),
      DOCUMENT,
      {},
    );
    expect(document.content?.[0]?.attrs).toEqual({
      fieldId: FIELD_2,
      variable: '',
      showValidationHints: false,
    });
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
  // The stages whose supplied wording contains placeholders and versions,
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

  it('finds the translatable strings with versions', () => {
    expect(texts.length).toBeGreaterThan(400);
  });

  it('keeps every one as it is written', () => {
    const changed = texts
      .filter(({ message }) => {
        const kept = ast(suppliedRoundTrip(message, PLAIN));
        return JSON.stringify(kept) !== JSON.stringify(ast(message));
      })
      .map(({ name }) => name);
    expect(changed).toEqual([]);
  });

  it('shows the version for a missing value last, and records it first', () => {
    const message =
      'Hi{kind, select, missing {} a {, A} b {, B} other {, someone}}!';
    const document = messageToDocument(message, PLAIN, { versions: labels });
    const versions = document.content?.[0]?.content?.[1]?.attrs?.versions as {
      key: string;
    }[];
    expect(versions.map(({ key }) => key)).toEqual([
      'a',
      'b',
      'other',
      'missing',
    ]);
    expect(suppliedRoundTrip(message, PLAIN)).toBe(message);
  });
});

describe('a count pill of supplied wording outside its plural', () => {
  const countPill = (argument: string) => ({
    type: 'inlineValue',
    attrs: { id: countTokenId(argument) },
  });
  const line = (...content: RichTextContent[]): RichTextContent => ({
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  });
  const versionsOf = (
    argument: string,
    type: 'select' | 'plural',
    versions: Record<string, readonly RichTextContent[]>,
  ): RichTextContent => ({
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

  it('prints a pill in a different plural as that value', () => {
    const document = line(
      versionsOf('m', 'plural', { other: [countPill('n')] }),
    );
    expect(
      ast(printMessageStructure(documentToMessageNodes(document, PLAIN))),
    ).toEqual(ast('{m, plural, other {{n}}}'));
  });
});

/** The message a document writes, for a second trip through the editor. */
function messageStructureText(document: RichTextContent): string {
  return documentToMessage(document, DOCUMENT).message ?? '';
}
