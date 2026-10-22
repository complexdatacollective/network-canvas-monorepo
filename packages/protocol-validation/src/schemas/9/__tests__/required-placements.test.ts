import { describe, expect, it } from 'vitest';

import {
  findMessageArgumentProblem,
  findMissingPlacement,
  requirePlacements,
} from '../../../localization/messageArguments.ts';
import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import {
  BUTTONS_INTERFACE_TEXT,
  FORMS_INTERFACE_TEXT,
  type InterfaceTextEntry,
  MESSAGES_INTERFACE_TEXT,
  NAVIGATION_INTERFACE_TEXT,
  PASSPHRASE_INTERFACE_TEXT,
  VALIDATION_INTERFACE_TEXT,
} from '../interface-text-wording.ts';
import { suppliedStageText } from '../supplied-stage-text.ts';

// Every language Network Canvas supplies wording in.
const SUPPLIED_LOCALES = [
  'en',
  'de',
  'es',
  'fr',
  'it',
  'nl',
  'pt-BR',
  'zh-Hans',
  'zh-Hant',
];

const STAGE_TYPES = [
  'FamilyPedigree',
  'FinishSession',
  'Geospatial',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Narrative',
  'NarrativePedigree',
  'NetworkComposer',
  'Sociogram',
];

const setAt = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
) => {
  let node = target;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    node =
      typeof next === 'object' && next !== null
        ? (next as Record<string, unknown>)
        : (node[key] = {});
  }
  const last = path.at(-1);
  if (last !== undefined) node[last] = value;
};

const interfaceGroup = (
  entries: Readonly<Record<string, InterfaceTextEntry>>,
) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [key, entry.message]),
  );

/**
 * A protocol holding every text Network Canvas supplies, in every language it
 * supplies it in, so its sites carry the declarations the schema gives them.
 */
const suppliedProtocol = () => ({
  schemaVersion: 9,
  interfaceText: {
    navigation: interfaceGroup(NAVIGATION_INTERFACE_TEXT),
    buttons: interfaceGroup(BUTTONS_INTERFACE_TEXT),
    messages: interfaceGroup(MESSAGES_INTERFACE_TEXT),
    passphrase: interfaceGroup(PASSPHRASE_INTERFACE_TEXT),
    forms: interfaceGroup(FORMS_INTERFACE_TEXT),
    validation: interfaceGroup(VALIDATION_INTERFACE_TEXT),
  },
  stages: STAGE_TYPES.map((type) => {
    const stage: Record<string, unknown> = { id: type, type };
    for (const { path, value } of suppliedStageText(type, {
      defaultLocale: 'en',
      locales: SUPPLIED_LOCALES,
    })) {
      setAt(stage, path, value);
    }
    return stage;
  }),
});

const messageSites = collectLocalizedStrings(suppliedProtocol()).flatMap(
  (hit) =>
    hit.arguments === undefined
      ? []
      : [{ ...hit, declaration: hit.arguments, site: hit.path.join('.') }],
);

describe('the placements supplied wording requires', () => {
  it('covers the supplied text with placeholders', () => {
    const sites = messageSites.map(({ site }) => site);
    expect(sites).toContain('interfaceText.validation.minLength');
    expect(sites).toContain('stages.0.wording.connectParent');
    expect(sites).toContain('stages.0.completeness.itemText.parents.listItem');
    expect(sites).toContain('stages.3.minNodesNotice');
    expect(sites).toContain('stages.7.conditionText.snapshotInheritance');
  });

  // A declaration shared by several settings must suit each of them.
  it.each(messageSites.map((site) => [site.site, site]))(
    'are exactly what the English shows at %s',
    (_site, { declaration, value }) => {
      expect(requirePlacements(declaration, value.en ?? '', 'en')).toEqual(
        declaration,
      );
    },
  );

  it.each(messageSites.map((site) => [site.site, site]))(
    'are met by every supplied translation at %s',
    (_site, { declaration, value }) => {
      for (const locale of SUPPLIED_LOCALES) {
        const message = value[locale];
        if (message === undefined) continue;
        expect(
          findMessageArgumentProblem(message, declaration),
        ).toBeUndefined();
        expect(
          findMissingPlacement(message, declaration, locale),
          `${locale}: ${message}`,
        ).toBeUndefined();
      }
    },
  );
});
