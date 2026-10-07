import { describe, expect, it } from 'vitest';

import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import ProtocolSchemaV9 from '../schema.ts';

const ruleOn = (attribute: string) => ({
  type: 'node' as const,
  id: `rule-${attribute}`,
  options: {
    type: 'person',
    attribute,
    operator: 'EXACTLY' as const,
    value: 'Alice',
  },
});

const filterOn = (attribute: string) => ({ rules: [ruleOn(attribute)] });

// The base protocol, with `person.name` encrypted or not, and a rule on
// `attribute` in the name generator's skip logic, the sociogram's node filter
// and a name generator panel's filter.
const protocolWithRulesOn = (attribute: string, encrypted: boolean) => {
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
        skipLogic: { action: 'SKIP', filter: filterOn(attribute) },
        panels: [
          {
            id: 'panel-1',
            title: localized('People already named'),
            dataSource: 'existing',
            filter: filterOn(attribute),
          },
        ],
      },
      { ...sociogram, filter: filterOn(attribute) },
    ],
  };
};

const issuesOf = (protocol: unknown) =>
  (ProtocolSchemaV9.safeParse(protocol).error?.issues ?? []).map(
    ({ path, message }) => ({ path: path.join('.'), message }),
  );

const refusal = (path: string) => ({
  path,
  message:
    'Attribute "Name" is encrypted, so it cannot be used in a rule: rules are checked without the participant\'s passphrase, so they cannot read its answers.',
});

describe('Schema 9 rules on encrypted attributes', () => {
  it('refuses a rule on an encrypted attribute in skip logic, a stage filter and a panel filter', () => {
    expect(issuesOf(protocolWithRulesOn('name', true))).toEqual([
      refusal('stages.0.skipLogic.filter.rules.0.options.attribute'),
      refusal('stages.0.panels.0.filter.rules.0.options.attribute'),
      refusal('stages.1.filter.rules.0.options.attribute'),
    ]);
  });

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
