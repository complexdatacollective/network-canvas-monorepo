import { describe, expect, it } from 'vitest';

import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { testId, testVariableId } from '../../testing/testId.ts';
import { conditionIdOfName } from '../conditionText.ts';
import { withoutUnusedConditions } from '../useDynamicValueSite.ts';

const AGE = testVariableId('age');
const TALL = testId('condition/tall');
const OLD = testId('condition/old');

const nameOf = (conditionId: string) =>
  dynamicValueNameFor({ kind: 'condition', conditionId });

const RULES = {
  rules: [
    {
      id: testId('rule'),
      type: 'ego',
      options: { attribute: AGE, operator: 'EXISTS' },
    },
  ],
};

const testing = (conditionId: string) =>
  `{${nameOf(conditionId)}, select, true {Hi} other {Hello}}`;

describe('conditionIdOfName', () => {
  it('reads the condition a name in text stands for', () => {
    expect(conditionIdOfName(nameOf(TALL))).toBe(TALL);
  });

  it('reads no condition from a name that stands for something else', () => {
    expect(
      conditionIdOfName(
        dynamicValueNameFor({
          kind: 'attribute',
          role: 'ego',
          variableId: AGE,
        }),
      ),
    ).toBeUndefined();
    expect(conditionIdOfName('now')).toBeUndefined();
  });
});

describe('withoutUnusedConditions', () => {
  it('keeps a condition while some text tests it', () => {
    const stage = {
      title: { 'en-US': testing(TALL) },
      conditions: { [TALL]: RULES },
    };
    expect(withoutUnusedConditions(stage, {})).toBe(stage);
  });

  it('keeps a condition tested only in a translation', () => {
    const stage = {
      title: { 'en-US': 'Hello', 'es': testing(TALL) },
      conditions: { [TALL]: RULES },
    };
    expect(withoutUnusedConditions(stage, {})).toBe(stage);
  });

  it('drops a condition with the last text that tested it', () => {
    expect(
      withoutUnusedConditions(
        {
          title: { 'en-US': testing(OLD) },
          conditions: { [TALL]: RULES, [OLD]: RULES },
        },
        {},
      ),
    ).toEqual({
      title: { 'en-US': testing(OLD) },
      conditions: { [OLD]: RULES },
    });
  });

  it('drops the conditions key once no condition is left', () => {
    expect(
      withoutUnusedConditions(
        { title: { 'en-US': 'Hello' }, conditions: { [TALL]: RULES } },
        {},
      ),
    ).toEqual({ title: { 'en-US': 'Hello' } });
  });

  it('leaves alone a condition the stage already held untested when last saved', () => {
    const stage = {
      title: { 'en-US': 'Hello' },
      conditions: { [TALL]: RULES },
    };
    expect(withoutUnusedConditions(stage, stage)).toBe(stage);
  });

  it('drops a condition that was tested when last saved and is not now', () => {
    const saved = {
      title: { 'en-US': testing(TALL) },
      conditions: { [TALL]: RULES },
    };
    expect(
      withoutUnusedConditions(
        { title: { 'en-US': 'Hello' }, conditions: { [TALL]: RULES } },
        saved,
      ),
    ).toEqual({ title: { 'en-US': 'Hello' } });
  });
});
