import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { findDuplicateOptionLabels } from '../../../localization/duplicateLabels.ts';
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

const issuesFor = async (protocol: unknown) => {
  const result = await validateProtocol(withFinishStage(protocol), {
    draft: true,
  });
  return result.success ? [] : result.error.issues;
};

describe('two options of one attribute that read the same', () => {
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
  const migrated = () =>
    migrateProtocol(
      asSchema8Protocol(
        withCategoryLabels({ en: 'Friend' }, { en: 'friend' }, [
          { en: 'Yes' },
          { en: 'yes' },
        ]),
      ),
      9,
    );

  it('keeps the first label and adds the later option’s value to its own', () => {
    const variable = migrated().codebook.node?.person?.variables?.category;
    expect(variable?.type === 'categorical' ? variable.options : null).toEqual([
      { label: { en: 'Friend' }, value: 'friend' },
      { label: { en: 'friend (family)' }, value: 'family' },
    ]);
  });

  it('adds its position where the value is not text', () => {
    const variable = migrated().codebook.ego?.variables?.consent;
    expect(
      variable?.type === 'boolean' && 'options' in variable
        ? variable.options
        : null,
    ).toEqual([
      { label: { en: 'Yes' }, value: true },
      { label: { en: 'yes (2)' }, value: false },
    ]);
  });

  it('adds its position where the value reads as the label, and a number where that is taken too', () => {
    const protocol = withCategoryLabels({ en: 'Family' }, { en: 'family' });
    const options = protocol.codebook.node.person.variables.category.options;
    protocol.codebook.node.person.variables.category.options = [
      ...options,
      { label: { en: 'Family (2)' }, value: 'other' },
    ];
    const variable = migrateProtocol(asSchema8Protocol(protocol), 9).codebook
      .node?.person?.variables?.category;
    expect(
      variable?.type === 'categorical'
        ? variable.options.map(({ label }) => label)
        : null,
    ).toEqual([{ en: 'Family' }, { en: 'family (2 2)' }, { en: 'Family (2)' }]);
  });

  // Option labels are markdown, so a value written into one has to read as
  // typed: `*star*` must not turn into emphasis, nor `[link](…)` into a link.
  it('adds a value the way it reads, whatever markdown or message syntax it holds', async () => {
    const protocol = withCategoryLabels({ en: 'Same' }, { en: 'Same' });
    const values = [
      'first',
      '*star*',
      '_edge_',
      '[link](http://x.test)',
      '{brace}',
    ];
    protocol.codebook.node.person.variables.category.options = [
      ...values.map((value) => ({ label: { en: 'Same' }, value })),
      // Labels are markdown already: one that shows its own value, escaped,
      // reads the same as that value, which cannot tell the two apart.
      { label: { en: '\\*x\\*' }, value: 'x' },
      { label: { en: '\\*x\\*' }, value: '*x*' },
    ];
    const upgraded = migrateProtocol(asSchema8Protocol(protocol), 9);
    const variable = upgraded.codebook.node?.person?.variables?.category;

    expect(
      variable?.type === 'categorical'
        ? variable.options.map(({ label }) => label.en)
        : null,
    ).toEqual([
      'Same',
      'Same (\\*star\\*)',
      'Same (\\_edge\\_)',
      'Same (\\[link\\](http://x.test))',
      "Same ('{'brace'}')",
      '\\*x\\*',
      '\\*x\\* (7)',
    ]);
    expect((await validateProtocol(upgraded, { draft: true })).success).toBe(
      true,
    );
  });
});
