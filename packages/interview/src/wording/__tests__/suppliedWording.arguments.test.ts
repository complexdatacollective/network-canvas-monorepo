import { describe, expect, it } from 'vitest';

import {
  collectLocalizedStringFields,
  findMessageArgumentProblem,
  findMissingPlacement,
  SUPPLIED_LANGUAGES,
  SUPPLIED_TEXTS,
} from '@codaco/protocol-validation';

import { suppliedInterfaceText, suppliedStageText } from '../suppliedWording';

// What a text must show is its field's to declare, in the schema. The
// interview's wording is held to the declaration like anyone's: each language's
// catalogue, for each text, must be text the schema accepts in that field.

const setAt = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
) => {
  let node = target;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (typeof next === 'object' && next !== null) {
      node = next as Record<string, unknown>;
    } else {
      const made: Record<string, unknown> = {};
      node[key] = made;
      node = made;
    }
  }
  const last = path.at(-1);
  if (last !== undefined) node[last] = value;
};

/** Every language Network Canvas words a text in: the supplied ones, and each variant. */
const WORDED_LANGUAGES = [
  ...new Set([
    ...SUPPLIED_LANGUAGES,
    ...SUPPLIED_TEXTS.flatMap(({ variants }) => variants ?? []),
  ]),
];

const STAGE_TYPES = [
  ...new Set(
    SUPPLIED_TEXTS.flatMap((text) =>
      text.kind === 'stageSetting' ? [text.stageType] : [],
    ),
  ),
];

/**
 * A protocol holding every text Network Canvas words, as it words it in
 * `locale`, so each text sits in the field the schema declares for it.
 */
const protocolWordedIn = (locale: string) => {
  const localization = { defaultLocale: locale, locales: [locale] };
  const interfaceText: Record<string, unknown> = {};
  for (const text of SUPPLIED_TEXTS) {
    if (text.kind !== 'interfaceText') continue;
    const value = suppliedInterfaceText(text.group, text.key, localization);
    if (value !== undefined && Object.keys(value).length > 0) {
      setAt(interfaceText, [text.group, text.key], value);
    }
  }
  return {
    schemaVersion: 9,
    localization,
    interfaceText,
    stages: STAGE_TYPES.map((type) => {
      const stage: Record<string, unknown> = { id: type, type };
      for (const { path, value } of suppliedStageText(type, localization)) {
        if (Object.keys(value).length > 0) setAt(stage, path, value);
      }
      return stage;
    }),
  };
};

const fieldsWordedIn = (locale: string) =>
  collectLocalizedStringFields(protocolWordedIn(locale)).map((field) => ({
    ...field,
    site: field.path.join('.'),
  }));

describe('the arguments Network Canvas’s wording must show', () => {
  it('reaches every text Network Canvas words, in the field the schema declares for it', () => {
    const sites = fieldsWordedIn('en').map(({ site }) => site);
    // Each stage type holds its settings once, and a setting two types share
    // is a field of each.
    expect(sites).toHaveLength(SUPPLIED_TEXTS.length);
    expect(sites).toContain('interfaceText.validation.minLength');
    expect(sites).toContain(
      `stages.${STAGE_TYPES.indexOf('FamilyPedigree')}.wording.connectParent`,
    );
    expect(sites).toContain(
      `stages.${STAGE_TYPES.indexOf('FamilyPedigree')}.completeness.itemText.parents.listItem`,
    );
    expect(sites).toContain(
      `stages.${STAGE_TYPES.indexOf('NameGenerator')}.minNodesNotice`,
    );
    expect(sites).toContain(
      `stages.${STAGE_TYPES.indexOf('NarrativePedigree')}.conditionText.snapshotInheritance`,
    );
    const withArguments = fieldsWordedIn('en').filter(
      ({ arguments: declared }) => declared !== undefined,
    );
    expect(withArguments.length).toBeGreaterThan(60);
  });

  it.each(WORDED_LANGUAGES)(
    'is text the schema accepts in its field, showing every argument it must, in %s',
    (locale) => {
      const fields = fieldsWordedIn(locale);
      // A variant words only the texts the schema lists it for.
      expect(fields.length).toBeGreaterThan(0);
      if (SUPPLIED_LANGUAGES.includes(locale)) {
        expect(fields).toHaveLength(SUPPLIED_TEXTS.length);
      }
      for (const { site, value, schema, arguments: declared } of fields) {
        const message = value[locale];
        expect(message, site).toBeTypeOf('string');
        if (message === undefined) continue;
        expect(schema.safeParse(value).success, `${site}: ${message}`).toBe(
          true,
        );
        if (declared === undefined) continue;
        expect(
          findMessageArgumentProblem(message, declared),
          `${site}: ${message}`,
        ).toBeUndefined();
        expect(
          findMissingPlacement(message, declared, locale),
          `${site}: ${message}`,
        ).toBeUndefined();
      }
    },
  );
});
