import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import {
  testId,
  testVariableId,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import { CONTENT_DOCUMENT_PROBLEMS } from '../../../localization/contentDocumentProblems.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import { dynamicValueNameFor, optionCaseKey } from '../dynamic-value-names.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const ANSWERED_ID = testId('answered');
const ANSWERED = dynamicValueNameFor({
  kind: 'condition',
  conditionId: ANSWERED_ID,
});
const AGE = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('egoAge'),
});
const NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('egoName'),
});

const conditions = {
  [ANSWERED_ID]: {
    rules: [
      {
        type: 'ego',
        id: testId('rule'),
        options: { attribute: 'egoName', operator: 'EXISTS' },
      },
    ],
  },
};

/** A protocol whose only stage is an Information page of `content`. */
const pageWith = (content: string, label = localized('Welcome')) =>
  withFinishStage(
    withTestCodebookIds({
      ...createBaseProtocol(),
      stages: [
        {
          id: testId('info'),
          type: 'Information',
          label,
          conditions,
          content: localized(content),
        },
      ],
    }),
  );

const problemsOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => ({
        path: path.join('.'),
        message,
      }));
};

const CONTENT = 'stages.0.content.en';

describe('logic blocks in text of several lines', () => {
  it.each([
    [
      'conditions',
      `# Welcome\n\n{${ANSWERED}, select, true {Thank you, {${NAME}}.} other {Please answer.}}`,
    ],
    [
      'rows of conditions, with blocks in each version',
      `{${ANSWERED}, select, false {## Not yet\n\nPlease answer.} other {{${ANSWERED}, select, true {Thank you.} other {}}}}`,
    ],
    [
      'a number',
      `{${AGE}, select, missing {} other {{${AGE}, plural, one {You are # year old.} other {You are # years old.}}}}`,
    ],
  ])('accepts %s', (_, content) => {
    expect(problemsOf(pageWith(content))).toEqual([]);
  });

  it('accepts a value that can be missing anywhere, which shows nothing when it is', () => {
    expect(problemsOf(pageWith(`Hello {${NAME}}.`))).toEqual([]);
  });

  it('refuses a choice of versions inside a sentence', () => {
    expect(
      problemsOf(
        pageWith(
          `Hello {${ANSWERED}, select, true {again} other {there}}, welcome.`,
        ),
      ),
    ).toEqual([
      { path: CONTENT, message: CONTENT_DOCUMENT_PROBLEMS.inlineChoice },
    ]);
  });

  it('refuses a whole-block choice that is not a logic block', () => {
    expect(
      problemsOf(pageWith(`{${ANSWERED}, select, yes {Yes.} other {No.}}`)),
    ).toEqual([
      { path: CONTENT, message: CONTENT_DOCUMENT_PROBLEMS.unrecognisedLogic },
    ]);
  });

  it('refuses a logic block whose condition the stage does not have', () => {
    const gone = dynamicValueNameFor({
      kind: 'condition',
      conditionId: testId('gone'),
    });
    expect(
      problemsOf(pageWith(`{${gone}, select, true {Yes.} other {No.}}`)),
    ).toEqual([
      { path: CONTENT, message: expect.stringContaining('no longer exist') },
    ]);
  });

  it('refuses an answers block with a version for an answer the attribute does not have', () => {
    const problems = problemsOf(
      pageWith(
        `{${NAME}, select, missing {} ${optionCaseKey(testId('none'))} {x} other {y}}`,
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe(CONTENT);
  });

  it('refuses a choice in text of one line, which has no logic blocks', () => {
    const base = createBaseProtocol();
    const [nameGenerator] = base.stages;
    const field = nameGenerator?.form?.fields[0];
    if (field === undefined) throw new Error('No form field');
    field.prompt = localized(
      `{${ANSWERED}, select, true {Their name?} other {Name?}}`,
    );
    expect(
      problemsOf(
        withFinishStage(
          withTestCodebookIds({
            ...base,
            stages: [{ ...nameGenerator, conditions }],
          }),
        ),
      ),
    ).toEqual([
      {
        path: 'stages.0.form.fields.0.prompt.en',
        message: CONTENT_DOCUMENT_PROBLEMS.inlineChoice,
      },
    ]);
  });
});
