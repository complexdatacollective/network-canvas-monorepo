import { describe, expect, it } from 'vitest';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds.ts';
import {
  dynamicValueNameFor,
  optionCaseKey,
} from '../../schemas/9/dynamic-values.ts';
import { withoutRemovedOptionVersions } from '../removedOptionVersions.ts';

const MOOD_ID = testVariableId('mood');
const CLOSE_ID = testVariableId('close');
const PERSON = testTypeId('person');
const HAPPY = testId('option/happy');
const SAD = testId('option/sad');
const NEAR = testId('option/near');

const EGO_MOOD = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: MOOD_ID,
});
const NODE_CLOSE = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: CLOSE_ID,
});
const SOURCE_CLOSE = dynamicValueNameFor({
  kind: 'attribute',
  role: 'dyadSource',
  variableId: CLOSE_ID,
});

const happy = optionCaseKey(HAPPY);
const sad = optionCaseKey(SAD);
const near = optionCaseKey(NEAR);

/** Text on `EGO_MOOD` with a version for each of its two options. */
const moodText = (glad: string, blue: string) =>
  `I feel{${EGO_MOOD}, select, missing {} ${happy} { ${glad}} ${sad} { ${blue}} other {}}.`;

const protocolWith = (
  stages: readonly Record<string, unknown>[],
  label?: Record<string, string>,
) => ({
  schemaVersion: 9,
  codebook: {
    ego: {
      variables: {
        [MOOD_ID]: {
          name: 'mood',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { id: HAPPY, value: 'happy', label: { en: 'Happy' } },
            { id: SAD, value: 'sad', label: { en: 'Sad' } },
          ],
        },
      },
    },
    node: {
      [PERSON]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [CLOSE_ID]: {
            name: 'close',
            type: 'ordinal',
            component: 'LikertScale',
            options: [{ id: NEAR, value: 1, label: { en: 'Near' } }],
          },
        },
        ...(label !== undefined && { dynamicLabel: { text: label } }),
      },
    },
    edge: {},
  },
  stages,
});

const information = (content: Record<string, string>) => ({
  id: testId('stage/information'),
  type: 'Information',
  label: { en: 'Welcome' },
  content,
});

describe('withoutRemovedOptionVersions', () => {
  it('removes the version for a deleted option from every translation, and keeps the rest', () => {
    const protocol = protocolWith([
      information({
        en: moodText('glad', 'blue'),
        fr: moodText('content', 'triste'),
      }),
    ]);

    const pruned = withoutRemovedOptionVersions(protocol, MOOD_ID, [SAD]);

    expect(pruned.stages[0]?.content).toEqual({
      en: `I feel{${EGO_MOOD}, select, missing {} ${happy} { glad} other {}}.`,
      fr: `I feel{${EGO_MOOD}, select, missing {} ${happy} { content} other {}}.`,
    });
    // A copy: the protocol it was given is left as it was.
    expect(protocol.stages[0]?.content).toEqual({
      en: moodText('glad', 'blue'),
      fr: moodText('content', 'triste'),
    });
  });

  it('keeps a select left with only its missing and other versions', () => {
    const protocol = protocolWith([
      information({
        en: `Hi{${EGO_MOOD}, select, missing {} ${sad} { there} other { all}}`,
      }),
    ]);

    expect(
      withoutRemovedOptionVersions(protocol, MOOD_ID, [SAD]).stages[0]?.content,
    ).toEqual({ en: `Hi{${EGO_MOOD}, select, missing {} other { all}}` });
  });

  it('reaches text nested in another version, a form field’s question and a node type’s label', () => {
    const protocol = protocolWith(
      [
        information({
          en: `{${EGO_MOOD}, select, missing {} other {Hi{${SOURCE_CLOSE}, select, ${near} { close} other {}}}}`,
        }),
        {
          id: testId('stage/form'),
          type: 'AlterForm',
          label: { en: 'About them' },
          subject: { entity: 'node', types: [PERSON] },
          form: {
            fields: [
              {
                id: testId('field/close'),
                variable: CLOSE_ID,
                prompt: {
                  en: `How{${NODE_CLOSE}, select, ${near} { close} other {}}?`,
                },
              },
            ],
          },
        },
      ],
      { en: `{${NODE_CLOSE}, select, ${near} {Near} other {Someone}}` },
    );

    const pruned = withoutRemovedOptionVersions(protocol, CLOSE_ID, [NEAR]);

    expect(pruned.stages[0]?.content).toEqual({
      en: `{${EGO_MOOD}, select, missing {} other {Hi{${SOURCE_CLOSE}, select, other {}}}}`,
    });
    expect(
      (pruned.stages[1] as { form: { fields: { prompt: unknown }[] } }).form
        .fields[0]?.prompt,
    ).toEqual({ en: `How{${NODE_CLOSE}, select, other {}}?` });
    expect(pruned.codebook.node[PERSON]?.dynamicLabel?.text).toEqual({
      en: `{${NODE_CLOSE}, select, other {Someone}}`,
    });
  });

  it('leaves a version for an option of another variable, and returns the protocol itself when nothing names the options', () => {
    const protocol = protocolWith([
      information({ en: moodText('glad', 'blue') }),
    ]);

    // `close` has no version anywhere, and `mood`'s versions are not its.
    expect(withoutRemovedOptionVersions(protocol, CLOSE_ID, [SAD])).toBe(
      protocol,
    );
    expect(withoutRemovedOptionVersions(protocol, MOOD_ID, [])).toBe(protocol);
  });
});
