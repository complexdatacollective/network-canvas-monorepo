import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { findDuplicateOptionLabels } from '../../../localization/duplicateLabels.ts';
import { DUPLICATE_LABEL } from '../../../localization/labelCollisions.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import type { InterfaceOwnedOptionSetKey } from '../entity-attribute-reference.ts';
import {
  isSuppliedOptionLabelSet,
  SUPPLIED_PEDIGREE_OPTION_LABELS,
  suppliedOptionLabels,
} from '../family-pedigree-option-labels.ts';
import { INTERFACE_OWNED_OPTION_SETS } from '../interface-owned-options.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

type Label = Record<string, string>;

const CATEGORY_PATH = ['codebook', 'node', 'person', 'variables', 'category'];

/**
 * The base protocol in English and French, with the person type's
 * `category` options labelled as given, and a yes-or-no ego attribute.
 */
const withCategoryLabels = (
  first: Label,
  second: Label,
  answers: [Label, Label] = [{ en: 'Yes' }, { en: 'No' }],
) => {
  const base = createBaseProtocol();
  const { person } = base.codebook.node;
  return {
    ...base,
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    codebook: {
      ...base.codebook,
      ego: {
        variables: {
          ...base.codebook.ego.variables,
          consent: {
            name: 'Consent',
            type: 'boolean',
            options: [
              { label: answers[0], value: true },
              { label: answers[1], value: false },
            ],
          },
        },
      },
      node: {
        ...base.codebook.node,
        person: {
          ...person,
          variables: {
            ...person.variables,
            category: {
              ...person.variables.category,
              options: [
                { label: first, value: 'friend' },
                { label: second, value: 'family' },
              ],
            },
          },
        },
      },
    },
  };
};

/** What refuses `protocol` when it is handed over, as an import is. */
const issuesFor = async (protocol: unknown) => {
  const result = await validateProtocol(withFinishStage(protocol));
  return result.success ? [] : result.error.issues;
};

describe('two options of one attribute that read the same', () => {
  // A change of the protocol's languages can leave two labels reading the
  // same through fallback, and is made anyway: the researcher is shown the
  // collision, and the protocol cannot leave its editor until it is fixed.
  it('are allowed in a protocol being written', async () => {
    const protocol = withCategoryLabels({ en: 'Friend' }, { en: 'friend' });
    const result = await validateProtocol(withFinishStage(protocol), {
      draft: true,
    });
    expect(result.error?.issues).toBeUndefined();
  });

  it('refuse a protocol handed over, naming the attribute, both labels and the language', async () => {
    expect(
      await issuesFor(
        withCategoryLabels({ en: 'Friend', fr: 'Ami' }, { en: ' friend' }),
      ),
    ).toEqual([
      {
        code: DUPLICATE_LABEL,
        path: [...CATEGORY_PATH, 'options', 1, 'label'],
        message:
          'Options 1 and 2 of attribute "Category" have labels that read the same: "Friend" and " friend" (en). Each option needs a label participants can tell apart.',
      },
    ]);
  });

  it('accepts options a participant can tell apart in every language', async () => {
    expect(
      await issuesFor(
        withCategoryLabels(
          { en: 'Friend', fr: 'Ami' },
          { en: 'Family', fr: 'Famille' },
        ),
      ),
    ).toEqual([]);
  });

  it('refuses two that read the same in the default language', async () => {
    const issues = await issuesFor(
      withCategoryLabels({ en: 'Friend' }, { en: ' friend' }),
    );
    expect(issues.map(({ path }) => path)).toContainEqual([
      ...CATEGORY_PATH,
      'options',
      1,
      'label',
    ]);
  });

  it('refuses two that read the same in another language', async () => {
    const issues = await issuesFor(
      withCategoryLabels(
        { en: 'Friend', fr: 'Proche' },
        { en: 'Family', fr: 'proche' },
      ),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: [...CATEGORY_PATH, 'options', 1, 'label'],
        message: expect.stringContaining('(fr)'),
      }),
    );
  });

  // The second option has no French label, so French participants read its
  // English one, which is the first option's French label.
  it('refuses two that read the same only through fallback', async () => {
    const issues = await issuesFor(
      withCategoryLabels({ en: 'Friend', fr: 'Family' }, { en: 'Family' }),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        path: [...CATEGORY_PATH, 'options', 1, 'label'],
        message: expect.stringContaining('(fr)'),
      }),
    ]);
  });

  it('refuses a yes-or-no attribute whose two answers read the same', async () => {
    const issues = await issuesFor(
      withCategoryLabels({ en: 'Friend' }, { en: 'Family' }, [
        { en: 'Yes' },
        { en: 'YES' },
      ]),
    );
    expect(issues.map(({ path }) => path)).toContainEqual([
      'codebook',
      'ego',
      'variables',
      'consent',
      'options',
      1,
      'label',
    ]);
  });
});

const isOwnedOptionSet = (key: string): key is InterfaceOwnedOptionSetKey =>
  Object.hasOwn(INTERFACE_OWNED_OPTION_SETS, key);

describe('the option sets an interface owns', () => {
  it('label their options distinctly in every language Network Canvas supplies', () => {
    const locales = Object.keys(SUPPLIED_PEDIGREE_OPTION_LABELS);
    const localization = { defaultLocale: 'en', locales };
    for (const key of Object.keys(INTERFACE_OWNED_OPTION_SETS).filter(
      isOwnedOptionSet,
    )) {
      const set = INTERFACE_OWNED_OPTION_SETS[key];
      const options = set.options.map(({ value, label }) => ({
        value,
        label: isSuppliedOptionLabelSet(key)
          ? suppliedOptionLabels(key, value, localization)
          : label === undefined
            ? undefined
            : { en: label },
      }));
      expect({
        key,
        duplicates: findDuplicateOptionLabels(options, localization),
      }).toEqual({
        key,
        duplicates: [],
      });
    }
  });
});

describe('migrating options whose labels read the same from schema 8', () => {
  // A label is what a participant chooses between, so Network Canvas does
  // not reword one: the researcher tells the options apart in the version of
  // Architect that made the protocol, and opens it again.
  /** The issues a migration of `protocol` to schema 9 is refused for. */
  const refusalOf = (protocol: unknown) => {
    try {
      migrateProtocol(asSchema8Protocol(protocol), 9);
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationResultInvalidError);
      return JSON.parse(
        (error instanceof Error ? error.message : '').replace(
          'Migration resulted in invalid protocol: ',
          '',
        ),
      ) as unknown;
    }
    return undefined;
  };

  it('is refused, naming the attribute and both options', () => {
    expect(
      refusalOf(withCategoryLabels({ en: 'Friend' }, { en: 'friend' })),
    ).toEqual([
      {
        code: DUPLICATE_LABEL,
        path: [...CATEGORY_PATH, 'options', 1, 'label'],
        message:
          'Options 1 and 2 of attribute "Category" have labels that read the same: "Friend" and "friend". Each option needs a label participants can tell apart.',
      },
    ]);
  });

  it('is refused for the two answers of a yes-or-no attribute', () => {
    expect(
      refusalOf(
        withCategoryLabels({ en: 'Friend' }, { en: 'Family' }, [
          { en: 'Yes' },
          { en: 'yes' },
        ]),
      ),
    ).toEqual([
      expect.objectContaining({
        path: [
          'codebook',
          'ego',
          'variables',
          'consent',
          'options',
          1,
          'label',
        ],
        message: expect.stringContaining(
          'of attribute "Consent" have labels that read the same: "Yes" and "yes".',
        ),
      }),
    ]);
  });

  it('leaves labels a participant can tell apart as they are', () => {
    const variable = migrateProtocol(
      asSchema8Protocol(withCategoryLabels({ en: 'Friend' }, { en: 'Family' })),
      9,
    ).codebook.node?.person?.variables?.category;
    expect(variable?.type === 'categorical' ? variable.options : null).toEqual([
      { label: { en: 'Friend' }, value: 'friend' },
      { label: { en: 'Family' }, value: 'family' },
    ]);
  });
});
