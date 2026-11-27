import { describe, expect, it } from 'vitest';

import { testId, testVariableId } from '../../__tests__/testIds.ts';
import {
  dynamicValueNameFor,
  optionCaseKey,
} from '../../schemas/9/dynamic-value-names.ts';
import {
  type ContentNode,
  type ContentNodes,
  fieldIdsIn,
  logicBlocksIn,
  printContentDocument,
  readContentDocument,
} from '../contentDocument.ts';
import { fieldBlockMarkdown } from '../fieldBlock.ts';

const FIELD_1 = testId('field-1');
const FIELD_2 = testId('field-2');
const CONDITION_A = testId('condition-a');
const CONDITION_B = testId('condition-b');
const FRIEND = optionCaseKey(testId('friend'));

const A = dynamicValueNameFor({ kind: 'condition', conditionId: CONDITION_A });
const B = dynamicValueNameFor({ kind: 'condition', conditionId: CONDITION_B });
const KIND = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: testVariableId('kind'),
});
const COUNT = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('children'),
});
const NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('name'),
});
const PARTICIPANT = dynamicValueNameFor({ kind: 'participant', role: 'node' });
const DYNAMIC = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: testId('their-word'),
});

/** The text of one block, as the printer writes it. */
const textOf = (node: ContentNode | undefined) =>
  node === undefined ? undefined : printContentDocument([node]);

const texts = (nodes: ContentNodes) => nodes.map(textOf);

const problemKinds = (message: string) =>
  readContentDocument(message).problems.map(({ kind }) => kind);

describe('readContentDocument', () => {
  it('reads text with a long run of white space in time that grows with its length', () => {
    let read = 0;
    const timeOf = (length: number, runs: number): number =>
      Math.min(
        ...Array.from({ length: runs }, () => {
          // A different message each time, so that no reading is the
          // cached reading of an earlier one.
          read += 1;
          const message = `a${' '.repeat(length)}b${read}`;
          const start = performance.now();
          readContentDocument(message);
          return performance.now() - start;
        }),
      );
    // Warm up, so that the first timed run is not also the first run.
    timeOf(1_000, 1);
    const short = timeOf(20_000, 5);
    const long = timeOf(80_000, 5);
    // Four times the length: about 4 in linear time, about 16 in quadratic
    // time. The margin leaves room for a loaded machine.
    expect(long / short).toBeLessThan(9);
  });

  it('reads markdown and fields as blocks, in order', () => {
    const { nodes, problems } = readContentDocument(
      `# Heading\n\nSome text.\n\n${fieldBlockMarkdown(FIELD_1)}\n\nMore text.\n\n${fieldBlockMarkdown(FIELD_2)}`,
    );
    expect(problems).toEqual([]);
    expect(nodes.map(({ kind }) => kind)).toEqual([
      'markdown',
      'field',
      'markdown',
      'field',
    ]);
    expect(texts(nodes)).toEqual([
      '# Heading\n\nSome text.',
      fieldBlockMarkdown(FIELD_1),
      'More text.',
      fieldBlockMarkdown(FIELD_2),
    ]);
    expect(fieldIdsIn(nodes)).toEqual([FIELD_1, FIELD_2]);
  });

  it('keeps the values that text shows inside its markdown', () => {
    const { nodes, problems } = readContentDocument(`Hello {${NAME}}.`);
    expect(problems).toEqual([]);
    expect(texts(nodes)).toEqual([`Hello {${NAME}}.`]);
  });

  it('reads a conditions block, with a version for when its rules are met or not met', () => {
    const met = readContentDocument(`{${A}, select, true {Met.} other {Not.}}`);
    expect(met.problems).toEqual([]);
    const [block] = met.nodes;
    expect(block?.kind).toBe('logic');
    if (block?.kind !== 'logic' || block.logic.kind !== 'conditions') {
      throw new Error('Not a conditions block');
    }
    expect(block.logic.versions).toHaveLength(1);
    expect(block.logic.versions[0]).toMatchObject({
      conditionId: CONDITION_A,
      when: 'met',
    });
    expect(texts(block.logic.versions[0]?.content ?? [])).toEqual(['Met.']);
    expect(texts(block.logic.otherwise)).toEqual(['Not.']);

    const notMet = readContentDocument(
      `{${A}, select, false {Not met.} other {Met.}}`,
    );
    expect(notMet.nodes[0]).toMatchObject({
      logic: { kind: 'conditions', versions: [{ when: 'notMet' }] },
    });
  });

  it('reads a conditions block whose other version is one further conditions block as its next version', () => {
    const message = `{${A}, select, true {First.} other {{${B}, select, false {Second.} other {Third.}}}}`;
    const [block] = readContentDocument(message).nodes;
    if (block?.kind !== 'logic' || block.logic.kind !== 'conditions') {
      throw new Error('Not a conditions block');
    }
    expect(
      block.logic.versions.map(({ conditionId, when }) => [conditionId, when]),
    ).toEqual([
      [CONDITION_A, 'met'],
      [CONDITION_B, 'notMet'],
    ]);
    expect(texts(block.logic.otherwise)).toEqual(['Third.']);
    expect(printContentDocument([block])).toBe(message);
  });

  it('keeps an other version with more than one block as the otherwise content', () => {
    const [block] = readContentDocument(
      `{${A}, select, true {First.} other {Before.\n\n{${B}, select, true {Second.} other {Third.}}}}`,
    ).nodes;
    if (block?.kind !== 'logic' || block.logic.kind !== 'conditions') {
      throw new Error('Not a conditions block');
    }
    expect(block.logic.versions).toHaveLength(1);
    expect(block.logic.otherwise.map(({ kind }) => kind)).toEqual([
      'markdown',
      'logic',
    ]);
  });

  it('reads an answers block, with a version for no answer, each answer and any other answer', () => {
    const [block] = readContentDocument(
      `{${KIND}, select, missing {No answer.} ${FRIEND} {A friend.} other {Someone.}}`,
    ).nodes;
    if (block?.kind !== 'logic' || block.logic.kind !== 'answers') {
      throw new Error('Not an answers block');
    }
    expect(block.logic.value).toBe(KIND);
    expect(texts(block.logic.missing)).toEqual(['No answer.']);
    expect(block.logic.versions.map(({ caseKey }) => caseKey)).toEqual([
      FRIEND,
    ]);
    expect(texts(block.logic.versions[0]?.content ?? [])).toEqual([
      'A friend.',
    ]);
    expect(texts(block.logic.other)).toEqual(['Someone.']);
  });

  it('reads a number block, with a version for no number and each plural category', () => {
    const message = `{${COUNT}, select, missing {No children.} other {{${COUNT}, plural, one {# child} other {# children}}}}`;
    const [block] = readContentDocument(message).nodes;
    if (block?.kind !== 'logic' || block.logic.kind !== 'number') {
      throw new Error('Not a number block');
    }
    expect(block.logic.value).toBe(COUNT);
    expect(texts(block.logic.missing)).toEqual(['No children.']);
    expect(
      block.logic.counted.versions.map(({ category }) => category),
    ).toEqual(['one']);
    expect(texts(block.logic.counted.other)).toEqual(['# children']);
    // The count is shown where the version has `#`.
    expect(printContentDocument([block])).toBe(message);
  });

  it('reads a participant block, with a version for the participant and one for anyone else', () => {
    const [block] = readContentDocument(
      `{${PARTICIPANT}, select, true {You.} other {Them.}}`,
    ).nodes;
    if (block?.kind !== 'logic' || block.logic.kind !== 'participant') {
      throw new Error('Not a participant block');
    }
    expect(texts(block.logic.participant)).toEqual(['You.']);
    expect(texts(block.logic.otherwise)).toEqual(['Them.']);
  });

  it('reads fields and logic blocks inside the versions of a logic block', () => {
    const message = [
      'Intro.',
      fieldBlockMarkdown(FIELD_1),
      `{${A}, select, true {Only then.\n\n${fieldBlockMarkdown(FIELD_2)}\n\n{${KIND}, select, missing {} ${FRIEND} {Friend.} other {}}} other {}}`,
    ].join('\n\n');
    const { nodes, problems } = readContentDocument(message);
    expect(problems).toEqual([]);
    expect(fieldIdsIn(nodes)).toEqual([FIELD_1, FIELD_2]);
    const blocks = logicBlocksIn(nodes);
    expect(blocks.map(({ logic }) => logic.kind)).toEqual([
      'conditions',
      'answers',
    ]);
    expect(blocks.map(({ fieldIds }) => fieldIds)).toEqual([[FIELD_2], []]);
  });

  it('reads a version with blank lines at its start and end as the same blocks', () => {
    const [block] = readContentDocument(
      `{${A}, select, true {\n\nMet.\n\n} other {Not.}}`,
    ).nodes;
    if (block?.kind !== 'logic' || block.logic.kind !== 'conditions') {
      throw new Error('Not a conditions block');
    }
    expect(texts(block.logic.versions[0]?.content ?? [])).toEqual(['Met.']);
  });

  describe('problems', () => {
    it('reports text that is not a message', () => {
      expect(problemKinds('Hello {')).toEqual(['unreadable']);
    });

    it('reports a choice inside a sentence, and keeps it in the markdown', () => {
      const message = `Hello {${A}, select, true {friend} other {there}}.`;
      const { nodes, problems } = readContentDocument(message);
      expect(problems.map(({ kind }) => kind)).toEqual(['inlineChoice']);
      expect(printContentDocument(nodes)).toBe(message);
    });

    it('reports an indented choice, which markdown would read as part of a list or as code', () => {
      expect(
        problemKinds(`- Item\n\n    {${A}, select, true {x} other {y}}`),
      ).toContain('inlineChoice');
    });

    it.each([
      [
        'a condition with a case that is neither true nor false',
        `{${A}, select, yes {x} other {y}}`,
      ],
      [
        'a condition with both cases',
        `{${A}, select, true {x} false {y} other {z}}`,
      ],
      [
        'an attribute without a version for no answer',
        `{${KIND}, select, ${FRIEND} {x} other {y}}`,
      ],
      [
        'the participant with a case other than true',
        `{${PARTICIPANT}, select, false {x} other {y}}`,
      ],
      [
        'a number with an exact value',
        `{${COUNT}, select, missing {x} other {{${COUNT}, plural, =1 {one} other {#}}}}`,
      ],
      [
        'a number with an offset',
        `{${COUNT}, select, missing {x} other {{${COUNT}, plural, offset:1 one {#} other {#}}}}`,
      ],
      [
        'a plural that is not inside a select',
        `{${COUNT}, plural, one {#} other {#}}`,
      ],
      [
        'a dynamic attribute, with versions for no answer and any answer',
        `{${DYNAMIC}, select, missing {x} other {y}}`,
      ],
      [
        'the number of a dynamic attribute',
        `{${DYNAMIC}, select, missing {x} other {{${DYNAMIC}, plural, one {#} other {#}}}}`,
      ],
    ])('reports %s as a choice that is not a logic block', (_, message) => {
      const { nodes, problems } = readContentDocument(message);
      expect(problems.map(({ kind }) => kind)).toEqual(['unrecognisedLogic']);
      // The text is kept, so that nothing is lost.
      expect(printContentDocument(nodes)).toBe(message);
    });

    it('reports a problem inside a version at its version', () => {
      expect(
        readContentDocument(
          `{${A}, select, true {Hi {${B}, select, true {x} other {y}}} other {}}`,
        ).problems,
      ).toEqual([{ kind: 'inlineChoice', at: ['true'] }]);
    });

    it.each([
      [
        'beside text',
        `Answer: ${fieldBlockMarkdown(FIELD_1)}`,
        'fieldNotOwnParagraph',
      ],
      [
        'in a heading',
        `# ${fieldBlockMarkdown(FIELD_1)}`,
        'fieldNotOwnParagraph',
      ],
      [
        'in a quotation',
        `> ${fieldBlockMarkdown(FIELD_1)}`,
        'fieldNotOwnParagraph',
      ],
      ['in a list', `- ${fieldBlockMarkdown(FIELD_1)}`, 'fieldInList'],
      [
        'with a description',
        `![Your name](field:${FIELD_1})`,
        'fieldHasDescription',
      ],
      [
        'through a reference',
        `![][f]\n\n[f]: field:${FIELD_1}`,
        'fieldByReference',
      ],
      ['with a title', `![](field:${FIELD_1} "Your name")`, 'fieldNotStandard'],
      [
        'with its address in angle brackets',
        `![](<field:${FIELD_1}>)`,
        'fieldNotStandard',
      ],
      [
        'with its scheme in capitals',
        `![](FIELD:${FIELD_1})`,
        'fieldNotStandard',
      ],
    ])('reports a field %s', (_, message, kind) => {
      expect(problemKinds(message)).toContain(kind);
    });

    it('reports a field with a description only once', () => {
      expect(problemKinds(`![Your name](field:${FIELD_1} "Name")`)).toEqual([
        'fieldHasDescription',
      ]);
    });

    it('reports no problem with a field written in the standard way', () => {
      expect(
        problemKinds(
          `  ${fieldBlockMarkdown(FIELD_1)}  \n\n${fieldBlockMarkdown(FIELD_2)}`,
        ),
      ).toEqual([]);
    });
  });
});

describe('printContentDocument', () => {
  it.each([
    ['markdown', '# Heading\n\nSome *text* with {ego_name}.'],
    [
      'fields',
      `Intro.\n\n${fieldBlockMarkdown(FIELD_1)}\n\n${fieldBlockMarkdown(FIELD_2)}`,
    ],
    ['a conditions block', `{${A}, select, true {Met.} other {Not.}}`],
    [
      'rows of conditions',
      `{${A}, select, true {One.} other {{${B}, select, false {Two.} other {Three.}}}}`,
    ],
    [
      'an answers block',
      `{${KIND}, select, missing {} ${FRIEND} {Friend.} true {Yes.} other {Other.}}`,
    ],
    [
      'a number block whose versions show the count',
      `{${COUNT}, select, missing {None.} other {{${COUNT}, plural, one {# child} few {# kids} other {# children}}}}`,
    ],
    [
      'a participant block',
      `{${PARTICIPANT}, select, true {You.} other {Them.}}`,
    ],
    [
      'blocks inside versions',
      `Intro.\n\n{${A}, select, true {Then.\n\n${fieldBlockMarkdown(FIELD_1)}} other {{${KIND}, select, missing {} other {${fieldBlockMarkdown(FIELD_2)}}}}}`,
    ],
  ])('writes %s back as it was read', (_, message) => {
    expect(printContentDocument(readContentDocument(message).nodes)).toBe(
      message,
    );
  });

  it('writes the blocks of a document with one blank line between them', () => {
    expect(
      printContentDocument(
        readContentDocument(
          `One.\n\n\n\n${fieldBlockMarkdown(FIELD_1)}\n\n\nTwo.`,
        ).nodes,
      ),
    ).toBe(`One.\n\n${fieldBlockMarkdown(FIELD_1)}\n\nTwo.`);
  });

  it('writes a conditions block without versions as its otherwise content', () => {
    expect(
      printContentDocument([
        {
          kind: 'logic',
          logic: {
            kind: 'conditions',
            versions: [],
            otherwise: [{ kind: 'field', fieldId: FIELD_1 }],
          },
        },
      ]),
    ).toBe(fieldBlockMarkdown(FIELD_1));
  });

  it('writes the plural version for other last, empty when it shows nothing', () => {
    const [one] = readContentDocument('# thing').nodes;
    if (one === undefined) throw new Error('No block');
    expect(
      printContentDocument([
        {
          kind: 'logic',
          logic: {
            kind: 'number',
            value: COUNT,
            missing: [],
            counted: {
              by: 'category',
              versions: [{ category: 'one', content: [one] }],
              other: [],
            },
          },
        },
      ]),
    ).toBe(
      // A heading's `#` is text, not the count, so it is quoted in a plural.
      `{${COUNT}, select, missing {} other {{${COUNT}, plural, one {'#' thing} other {}}}}`,
    );
  });
});
