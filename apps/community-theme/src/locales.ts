import { siteNavigationMessages } from '@codaco/fresco-ui/navigation/SiteNavigation.messages';
import { isSiteLocale } from '@codaco/shared-consts';

import { SITE_LOCALES } from '../theme/javascripts/discourse/lib/site-locale.js';

// Shown to forum admins in the theme list and settings, so English only.
const THEME_METADATA = {
  description:
    'The Network Canvas look for the community forum: the shared site header, typefaces, colours and controls of the apps and websites.',
  settings: {
    site_navigation_script_url: {
      description:
        'Where the shared site header is loaded from. The default follows every 1.x release of @codaco/site-navigation-element; pin an exact version here to stop it updating.',
    },
  },
};

type YamlValue = string | { [key: string]: YamlValue };

function toYaml(value: { [key: string]: YamlValue }, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'string'
      ? [`${pad}${key}: ${JSON.stringify(entry)}`]
      : [`${pad}${key}:`, ...toYaml(entry, depth + 1)],
  );
}

/**
 * The theme's translation files, `locales/<discourse locale>.yml`, one per
 * language the Network Canvas sites are translated into. The forum's title
 * is the shared header's own "Community" label, so the forum and the header
 * say the same word in every language.
 */
export function themeLocales() {
  return Object.entries(SITE_LOCALES).map(([discourseLocale, siteLocale]) => {
    if (!isSiteLocale(siteLocale)) {
      throw new Error(
        `${discourseLocale} maps to unknown site locale ${siteLocale}`,
      );
    }
    const strings: { [key: string]: YamlValue } = {
      community: siteNavigationMessages[siteLocale].community,
    };
    if (discourseLocale === 'en') strings.theme_metadata = THEME_METADATA;
    return {
      path: `locales/${discourseLocale}.yml`,
      contents: `${toYaml({ [discourseLocale]: strings }).join('\n')}\n`,
    };
  });
}
