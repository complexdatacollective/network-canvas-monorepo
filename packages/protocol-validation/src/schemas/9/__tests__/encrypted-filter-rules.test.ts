import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import {
  type FilterOperator,
  TextOperators,
  TypeLevelOperators,
} from '../filters/filter.ts';
import ProtocolSchemaV9 from '../schema.ts';

const isPresence = (operator: FilterOperator) =>
  TypeLevelOperators.safeParse(operator).success;

const COMPARING_TEXT_OPERATORS = TextOperators.filter(
  (operator) => !isPresence(operator),
);

const ruleOn = (attribute: string, operator: FilterOperator = 'EXACTLY') => ({
  type: 'node' as const,
  id: `rule-${attribute}`,
  options: {
    type: 'person',
    attribute,
    operator,
    ...(isPresence(operator) ? {} : { value: 'Alice' }),
  },
});

const filterOn = (attribute: string, operator?: FilterOperator) => ({
  rules: [ruleOn(attribute, operator)],
});

// The base protocol, with `person.name` encrypted or not, and a rule on
// `attribute` in the name generator's skip logic, the sociogram's node filter
// and a name generator panel's filter.
const protocolWithRulesOn = (
  attribute: string,
  encrypted: boolean,
  operator?: FilterOperator,
) => {
  const base = createBaseProtocol();
  const { person } = base.codebook.node;
  const [nameGenerator, sociogram] = base.stages;
  return {
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: {
          ...person,
          variables: {
            ...person.variables,
            name: { ...person.variables.name, encrypted },
          },
        },
      },
    },
    stages: [
      {
        ...nameGenerator,
        skipLogic: { action: 'SKIP', filter: filterOn(attribute, operator) },
        panels: [
          {
            id: 'panel-1',
            title: localized('People already named'),
            dataSource: 'existing',
            filter: filterOn(attribute, operator),
          },
        ],
      },
      { ...sociogram, filter: filterOn(attribute, operator) },
    ],
  };
};

const issuesOf = (protocol: unknown) =>
  (
    ProtocolSchemaV9.safeParse(withFinishStage(protocol)).error?.issues ?? []
  ).map(({ path, message }) => ({ path: path.join('.'), message }));

const refusal = (path: string) => ({
  path,
  message:
    'Attribute "Name" is encrypted, so a rule can only check whether it is answered (EXISTS or NOT_EXISTS): rules are checked without the participant\'s passphrase, so they cannot compare its answers.',
});

describe('Schema 9 rules on encrypted attributes', () => {
  it.each(COMPARING_TEXT_OPERATORS)(
    'refuses a rule comparing an encrypted attribute with %s in skip logic, a stage filter and a panel filter',
    (operator) => {
      expect(issuesOf(protocolWithRulesOn('name', true, operator))).toEqual([
        refusal('stages.0.skipLogic.filter.rules.0.options.operator'),
        refusal('stages.0.panels.0.filter.rules.0.options.operator'),
        refusal('stages.1.filter.rules.0.options.operator'),
      ]);
    },
  );

  // Encryption turns an answer into another string and leaves an unanswered
  // attribute without a value, so whether it was answered is still readable.
  it.each(TypeLevelOperators.options)(
    'accepts a rule asking whether an encrypted attribute is answered with %s',
    (operator) => {
      expect(issuesOf(protocolWithRulesOn('name', true, operator))).toEqual([]);
    },
  );

  it('accepts the same rules when the attribute is not encrypted', () => {
    expect(issuesOf(protocolWithRulesOn('name', false))).toEqual([]);
  });

  it('accepts rules on another attribute of a type that encrypts one', () => {
    expect(issuesOf(protocolWithRulesOn('age', true))).toEqual([]);
  });

  // An external-data panel's rules read the researcher's own plaintext rows,
  // not the interview's stored answers.
  it('accepts a rule on an encrypted attribute in an external-data panel', () => {
    const protocol = protocolWithRulesOn('name', true);
    const [nameGenerator, sociogram] = protocol.stages;

    expect(
      issuesOf({
        ...protocol,
        assetManifest: {
          'previous-people': {
            id: 'previous-people',
            type: 'network',
            name: 'Previous people',
            source: 'previous-people.csv',
          },
        },
        stages: [
          {
            ...nameGenerator,
            skipLogic: undefined,
            panels: [
              {
                id: 'panel-1',
                title: localized('People from before'),
                dataSource: 'previous-people',
                filter: filterOn('name'),
              },
            ],
          },
          { ...sociogram, filter: undefined },
        ],
      }),
    ).toEqual([]);
  });

  it('accepts a rule that only asks whether the type exists', () => {
    const protocol = protocolWithRulesOn('name', true);
    const [nameGenerator, sociogram] = protocol.stages;
    const typeOnly = {
      rules: [
        {
          type: 'node',
          id: 'rule-type',
          options: { type: 'person', operator: 'EXISTS' },
        },
      ],
    };

    expect(
      issuesOf({
        ...protocol,
        stages: [
          {
            ...nameGenerator,
            skipLogic: { action: 'SKIP', filter: typeOnly },
            panels: [],
          },
          { ...sociogram, filter: typeOnly },
        ],
      }),
    ).toEqual([]);
  });
});
