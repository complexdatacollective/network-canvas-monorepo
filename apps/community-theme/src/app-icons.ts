import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { SOFTWARE_LINKS } from '../theme/javascripts/discourse/lib/site-links.js';

const require = createRequire(import.meta.url);

// The files the shared header's Software menu shows for each piece of
// software (fresco-ui navigation/assets), by the name the theme's software
// links give it.
const ICON_FILES: Record<string, string> = {
  architect: 'architect.png',
  interviewer: 'interviewer.svg',
  fresco: 'fresco.png',
  architectClassic: 'architect-classic.png',
  interviewerClassic: 'interviewer-classic.png',
};

export type ThemeAppIcon = {
  /** The theme asset name, which the theme's JavaScript reads the URL by. */
  asset: string;
  /** Where the icon sits in the theme. */
  path: string;
  /** The file on disk. */
  source: string;
};

/**
 * The software's icons, as theme assets, so the forum's Software menu shows
 * the same pictures as the shared header's.
 */
export function themeAppIcons(): ThemeAppIcon[] {
  const assets = join(
    dirname(
      require.resolve('@codaco/fresco-ui/navigation/SiteNavigation.messages'),
    ),
    'assets',
  );
  return SOFTWARE_LINKS.map(({ name, icon }) => {
    const file = ICON_FILES[name];
    if (!file) throw new Error(`No icon file for ${name}`);
    return {
      asset: icon,
      path: `assets/apps/${file}`,
      source: join(assets, file),
    };
  });
}
