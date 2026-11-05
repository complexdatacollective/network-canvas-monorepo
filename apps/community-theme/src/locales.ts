import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type MessageFormatElement,
  parse,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

import { siteNavigationMessages } from '@codaco/fresco-ui/navigation/SiteNavigation.messages';
import { isSiteLocale, type SiteLocale } from '@codaco/shared-consts';

import { SITE_LOCALES } from '../theme/javascripts/discourse/lib/site-locale.js';

// Shown to forum admins in the theme list and settings, so English only.
const THEME_METADATA = {
  description:
    'The Network Canvas look for the community forum: the site header with the forum’s controls in it, the typefaces, colours and controls of the apps and websites, and a home page that sends people to the right category.',
  settings: {
    help_category: {
      description:
        'Slug of the category the home page sends questions and problem reports to.',
    },
    ideas_category: {
      description:
        'Slug of the category the home page sends feature requests to.',
    },
    conversation_category: {
      description:
        'Slug of the category the home page sends general discussion to.',
    },
    news_category: {
      description:
        'Slug of the announcements category; its newest topic is linked above the home page heading.',
    },
    documentation_url: {
      description:
        'The documentation website the home page points to before people ask for help.',
    },
  },
};

// The landing page's message ids, less this prefix, are its Discourse keys.
const MESSAGE_ID_PREFIX = 'communityTheme.';

const localesDir = fileURLToPath(new URL('locales/', import.meta.url));

type PluralKey = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type DiscourseMessage = string | Partial<Record<PluralKey, string>>;
type YamlValue = string | { [key: string]: YamlValue };

const PLURAL_KEYS: readonly PluralKey[] = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
];

function isPluralKey(key: string): key is PluralKey {
  return PLURAL_KEYS.some((candidate) => candidate === key);
}

// Discourse picks a plural form by the language's CLDR category alone
// (make-plural), so the categories carry over and exact matches such as
// ICU's `=0` have nothing to become: English has no `zero` category.
function pluralKey(option: string, id: string): PluralKey {
  if (!isPluralKey(option)) {
    throw new Error(
      `${id}: Discourse cannot express the plural case ${option}`,
    );
  }
  return option;
}

function elementText(element: MessageFormatElement, id: string): string {
  switch (element.type) {
    case TYPE.literal:
      return element.value;
    case TYPE.argument:
      return `%{${element.value}}`;
    case TYPE.pound:
      return '%{count}';
    case TYPE.number:
    case TYPE.date:
    case TYPE.time:
    case TYPE.select:
    case TYPE.plural:
    case TYPE.tag:
      break;
  }
  throw new Error(
    `${id}: Discourse translations take plain text, {arguments} and one {count, plural} only`,
  );
}

function interpolated(
  elements: readonly MessageFormatElement[],
  id: string,
): string {
  return elements.map((element) => elementText(element, id)).join('');
}

/**
 * An ICU message in the form Discourse's translations use: arguments become
 * `%{name}`, and a message that is one `{count, plural, …}` becomes the
 * per-case map Discourse pluralises on `count`. Anything Discourse has no
 * form for is refused rather than shipped wrong.
 *
 * ICU uses `other` for any category a message leaves out, but Discourse shows
 * a missing translation instead, so each of the language's categories that
 * the message omits is filled with its `other` text (French, for one, has a
 * `many` that only round millions reach).
 */
export function toDiscourseMessage(
  icu: string,
  id: string,
  locale = 'en',
): DiscourseMessage {
  const elements = parse(icu);
  const [first] = elements;
  if (elements.length === 1 && first?.type === TYPE.plural) {
    if (first.value !== 'count' || first.offset !== 0) {
      throw new Error(`${id}: Discourse pluralises on {count} alone`);
    }
    const cases: Partial<Record<PluralKey, string>> = Object.fromEntries(
      Object.entries(first.options).map(([option, { value }]) => [
        pluralKey(option, id),
        interpolated(value, id),
      ]),
    );
    const other = cases.other;
    if (other === undefined) throw new Error(`${id}: the plural has no other`);
    for (const category of new Intl.PluralRules(locale).resolvedOptions()
      .pluralCategories) {
      cases[category] ??= other;
    }
    return cases;
  }
  return interpolated(elements, id);
}

function readCatalog(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return Object.fromEntries(Object.entries(parsed));
}

function englishMessages(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readCatalog(`${localesDir}en.json`)).map(([id, entry]) => {
      const message: unknown =
        typeof entry === 'object' && entry !== null && 'defaultMessage' in entry
          ? entry.defaultMessage
          : undefined;
      if (typeof message !== 'string') {
        throw new Error(`locales/en.json: ${id} has no defaultMessage`);
      }
      return [id, message];
    }),
  );
}

/** The app-i18n catalog a site locale's translations are kept in. */
function catalogLocaleFor(siteLocale: SiteLocale) {
  return siteLocale === 'en-US' ? 'en' : siteLocale;
}

/**
 * The landing page's messages in one language: the English defaults, with
 * that language's committed catalog over them. A language with no catalog
 * yet stays English.
 */
function landingMessages(siteLocale: SiteLocale): Record<string, string> {
  const english = englishMessages();
  const path = `${localesDir}${catalogLocaleFor(siteLocale)}.json`;
  if (siteLocale === 'en-US' || !existsSync(path)) return english;
  const translated = readCatalog(path);
  return Object.fromEntries(
    Object.entries(english).map(([id, message]) => {
      const translation = translated[id];
      return [id, typeof translation === 'string' ? translation : message];
    }),
  );
}

function nest(
  messages: Record<string, string>,
  locale: string,
): { [key: string]: YamlValue } {
  const root: { [key: string]: YamlValue } = {};
  for (const [id, message] of Object.entries(messages)) {
    if (!id.startsWith(MESSAGE_ID_PREFIX)) {
      throw new Error(`${id} is not a ${MESSAGE_ID_PREFIX}* message`);
    }
    const path = id.slice(MESSAGE_ID_PREFIX.length).split('.');
    const leaf = path.pop();
    if (!leaf) throw new Error(`${id} has no key`);
    let branch = root;
    for (const segment of path) {
      const next = (branch[segment] ??= {});
      if (typeof next === 'string') {
        throw new Error(`${id} nests under the message ${segment}`);
      }
      branch = next;
    }
    if (leaf in branch) throw new Error(`${id} collides with another key`);
    branch[leaf] = toDiscourseMessage(message, id, locale);
  }
  return root;
}

function toYaml(value: { [key: string]: YamlValue }, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'string'
      ? [`${pad}${key}: ${JSON.stringify(entry)}`]
      : [`${pad}${key}:`, ...toYaml(entry, depth + 1)],
  );
}

/**
 * The theme's translations for each language the Network Canvas sites are
 * translated into, keyed by Discourse locale. The forum's header is the
 * shared site header's design (components/site-navigation.gjs), so its words
 * are that header's own: "Community" names the forum's entry in it, and the
 * site's links and software (`site.*`, lib/site-links.js) carry the header's
 * labels and descriptions, in the header and in the forum's menu alike. The
 * landing page's copy comes from the app-i18n catalogs in `locales/`.
 */
export function themeStrings() {
  return Object.entries(SITE_LOCALES).map(([discourseLocale, siteLocale]) => {
    if (!isSiteLocale(siteLocale)) {
      throw new Error(
        `${discourseLocale} maps to unknown site locale ${siteLocale}`,
      );
    }
    const header = siteNavigationMessages[siteLocale];
    const strings: { [key: string]: YamlValue } = {
      community: header.community,
      site: {
        home: header.home,
        navigationLabel: header.navigationLabel,
        documentation: header.documentation,
        updates: header.updates,
        protocolGallery: header.protocolGallery,
        resources: header.resources,
        getStarted: header.getStarted,
        software: header.software,
        softwareLinks: Object.fromEntries(
          Object.entries(header.softwareLinks).map(
            ([id, { name, description, action }]) => [
              id,
              { name, description, action },
            ],
          ),
        ),
      },
      ...nest(landingMessages(siteLocale), siteLocale),
    };
    if (discourseLocale === 'en') strings.theme_metadata = THEME_METADATA;
    return { discourseLocale, strings };
  });
}

/** The theme's translation files, `locales/<discourse locale>.yml`. */
export function themeLocales() {
  return themeStrings().map(({ discourseLocale, strings }) => ({
    path: `locales/${discourseLocale}.yml`,
    contents: `${toYaml({ [discourseLocale]: strings }).join('\n')}\n`,
  }));
}
