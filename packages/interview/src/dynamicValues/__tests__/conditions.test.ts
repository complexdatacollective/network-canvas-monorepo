import { describe, expect, it } from 'vitest';

import {
  buildConnectivityIndex,
  conditionHolds,
  conditionReadsNetwork,
} from '@codaco/network-query';
import {
  type Conditions,
  ConditionsSchema,
  createProtocolObjectId,
  dynamicValueNameFor,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { contentFormatFor } from '../../localization/contentFormat';
import {
  type DynamicValueFormatters,
  type DynamicValueSources,
  resolveDynamicText,
} from '../resolveDynamicText';

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const LIKES = testTypeId('likes');
const AGE = testVariableId('age');
const CLOSE = testVariableId('close');
const YEARS = testVariableId('years');

const person = (id: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type: PERSON,
});

const edge = (
  id: string,
  from: string,
  to: string,
  type: string,
  attributes: NcEdge[typeof entityAttributesProperty] = {},
): NcEdge => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: attributes,
  type,
  from,
  to,
});

const connectivity = buildConnectivityIndex(
  [person('a'), person('b'), person('c')],
  [edge('1', 'a', 'b', KNOWS, { [YEARS]: 12 }), edge('2', 'a', 'c', LIKES)],
);

/** Each condition's id, by what it asks. */
const IDS = {
  adult: testId('condition adult'),
  closeAndKnown: testId('condition closeAndKnown'),
  oldFriend: testId('condition oldFriend'),
  popular: testId('condition popular'),
  strongTie: testId('condition strongTie'),
  gone: testId('condition gone'),
};

const CONDITIONS: Conditions = ConditionsSchema.parse({
  [IDS.adult]: {
    rules: [
      {
        type: 'ego',
        id: createProtocolObjectId(),
        options: {
          attribute: AGE,
          operator: 'GREATER_THAN_OR_EQUAL',
          value: 18,
        },
      },
    ],
  },
  [IDS.closeAndKnown]: {
    about: 'dyadTarget',
    join: 'AND',
    rules: [
      {
        type: 'node',
        id: createProtocolObjectId(),
        options: {
          type: PERSON,
          attribute: CLOSE,
          operator: 'EXACTLY',
          value: true,
        },
      },
      {
        type: 'edge',
        id: createProtocolObjectId(),
        options: { type: KNOWS, operator: 'EXISTS' },
      },
    ],
  },
  [IDS.oldFriend]: {
    about: 'node',
    rules: [
      {
        type: 'edge',
        id: createProtocolObjectId(),
        options: {
          type: KNOWS,
          attribute: YEARS,
          operator: 'GREATER_THAN',
          value: 10,
        },
      },
    ],
  },
  [IDS.popular]: {
    about: 'node',
    rules: [
      {
        type: 'edge',
        id: createProtocolObjectId(),
        options: { count: 'MOST' },
      },
    ],
  },
  [IDS.strongTie]: {
    about: 'edge',
    rules: [
      {
        type: 'edge',
        id: createProtocolObjectId(),
        options: {
          type: KNOWS,
          attribute: YEARS,
          operator: 'GREATER_THAN',
          value: 5,
        },
      },
    ],
  },
});

const holds = (
  id: keyof typeof IDS,
  subjects: Parameters<typeof conditionHolds>[1],
) => {
  const condition = CONDITIONS[IDS[id]];
  if (condition === undefined) throw new Error(`No condition ${id}`);
  return conditionHolds(condition, { connectivity, ...subjects });
};

describe('conditionHolds', () => {
  it('compares the participant’s answer', () => {
    expect(holds('adult', { attributes: { ego: { [AGE]: 30 } } })).toBe(true);
    expect(holds('adult', { attributes: { ego: { [AGE]: 12 } } })).toBe(false);
    expect(holds('adult', { attributes: { ego: {} } })).toBe(false);
  });

  it('asks of the node its condition is about, and of that node’s edges', () => {
    const about = (id: string, close: boolean) => ({
      attributes: { dyadTarget: { [CLOSE]: close } },
      entityIds: { dyadTarget: id },
    });
    expect(holds('closeAndKnown', about('b', true))).toBe(true);
    expect(holds('closeAndKnown', about('b', false))).toBe(false);
    // c is close, but no "knows" edge joins it to anyone.
    expect(holds('closeAndKnown', about('c', true))).toBe(false);
  });

  it('compares an attribute of an edge that joins the node to another', () => {
    const about = (id: string) => ({
      attributes: { node: {} },
      entityIds: { node: id },
    });
    expect(holds('oldFriend', about('b'))).toBe(true);
    expect(holds('oldFriend', about('c'))).toBe(false);
  });

  it('counts a node’s edges against the other nodes of its type', () => {
    const about = (id: string | undefined) => ({
      attributes: { node: {} },
      entityIds: id === undefined ? {} : { node: id },
      nodeType: PERSON,
    });
    expect(holds('popular', about('a'))).toBe(true);
    expect(holds('popular', about('b'))).toBe(false);
    // A node a form is adding is not in the network, and has no edges.
    expect(holds('popular', about(undefined))).toBe(false);
  });

  it('compares the edge itself where the condition is about an edge', () => {
    expect(holds('strongTie', { attributes: { edge: { [YEARS]: 12 } } })).toBe(
      true,
    );
    expect(holds('strongTie', { attributes: { edge: { [YEARS]: 2 } } })).toBe(
      false,
    );
  });

  it('is not met when what it is about is not on screen', () => {
    expect(holds('oldFriend', { attributes: {} })).toBe(false);
  });

  it('says which conditions follow the network', () => {
    const reads = (id: keyof typeof IDS) => {
      const condition = CONDITIONS[IDS[id]];
      return condition !== undefined && conditionReadsNetwork(condition);
    };
    expect(reads('adult')).toBe(false);
    expect(reads('closeAndKnown')).toBe(true);
    expect(reads('popular')).toBe(true);
    expect(reads('strongTie')).toBe(false);
  });
});

describe('stage text that chooses its wording by a condition', () => {
  // The name text gives each condition.
  const adult = dynamicValueNameFor({
    kind: 'condition',
    conditionId: IDS.adult,
  });
  const popular = dynamicValueNameFor({
    kind: 'condition',
    conditionId: IDS.popular,
  });
  const gone = dynamicValueNameFor({
    kind: 'condition',
    conditionId: IDS.gone,
  });
  const formatters: DynamicValueFormatters = {
    format: contentFormatFor('en'),
    resolveLabel: (label) => label.en ?? '',
    booleanWords: { yes: 'Yes', no: 'No' },
    versionOf: (wording) => ({ message: wording.en ?? '', locale: 'en' }),
  };
  const read = (message: string, extra: Partial<DynamicValueSources>) =>
    resolveDynamicText(
      message,
      'en',
      {
        intrinsics: { now: new Date('2026-10-13T12:00:00Z') },
        attributes: {},
        labels: {},
        conditions: CONDITIONS,
        connectivity,
        variablesFor: () => undefined,
        ...extra,
      },
      formatters,
    )?.text;

  it('reads the version for a condition that is met, and the one for when it is not', () => {
    const message = `{${adult}, select, true {your work} other {your school}}{${adult}, select, false { (with a guardian)} other {}}`;
    expect(read(message, { attributes: { ego: { [AGE]: 40 } } })).toBe(
      'your work',
    );
    expect(read(message, { attributes: { ego: { [AGE]: 9 } } })).toBe(
      'your school (with a guardian)',
    );
  });

  it('nests one condition inside another', () => {
    const message = `{${adult}, select, true {{${popular}, select, true {busy adult} other {adult}}} other {child}}`;
    const about = (age: number, id: string) => ({
      attributes: { ego: { [AGE]: age }, node: {} },
      entityIds: { node: id },
      nodeType: PERSON,
    });
    expect(read(message, about(30, 'a'))).toBe('busy adult');
    expect(read(message, about(30, 'b'))).toBe('adult');
    expect(read(message, about(3, 'a'))).toBe('child');
  });

  it('reads the version for true and the one for false', () => {
    const message = `{${adult}, select, true {an adult} false {a child} other {someone}}`;
    expect(read(message, { attributes: { ego: { [AGE]: 40 } } })).toBe(
      'an adult',
    );
    expect(read(message, { attributes: { ego: { [AGE]: 9 } } })).toBe(
      'a child',
    );
  });

  it('reads a condition the stage does not declare as missing', () => {
    expect(
      read(`{${gone}, select, missing {a} true {b} false {c} other {d}}`, {}),
    ).toBe('a');
    expect(read(`{${gone}, select, true {a} other {b}}`, {})).toBe('b');
  });
});
