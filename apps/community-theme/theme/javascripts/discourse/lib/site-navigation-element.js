import I18n from 'discourse-i18n';
import { settings } from 'virtual:theme';

import { siteLocaleFor } from './site-locale';

const TAG_NAME = 'nc-site-navigation';

/**
 * Loads the shared site header's custom element (`@codaco/site-navigation-
 * element`) once per page. It is the header every Network Canvas site shows,
 * published as a self-contained bundle, so the forum picks up each release
 * of it with no change here. The tag renders nothing until the definition
 * arrives, and the forum keeps its own logo and menu if it never does
 * (header.scss).
 */
export function loadSiteNavigation() {
  if (
    customElements.get(TAG_NAME) ||
    document.querySelector(`script[data-${TAG_NAME}]`)
  ) {
    return;
  }

  const script = document.createElement('script');
  script.type = 'module';
  script.src = settings.site_navigation_script_url;
  script.setAttribute(`data-${TAG_NAME}`, '');
  document.head.append(script);
}

/** The header's language: the forum's, as the sites name it. */
export function siteNavigationLocale() {
  return siteLocaleFor(I18n.currentLocale());
}

/**
 * The header's colour mode: the forum's, so a visitor who switches it sees
 * the header switch with the rest of the page.
 */
export function siteNavigationTheme(session, interfaceColor) {
  if (!session.darkModeAvailable) {
    return session.defaultColorSchemeIsDark ? 'dark' : 'light';
  }
  if (interfaceColor.darkModeForced) {
    return 'dark';
  }
  if (interfaceColor.lightModeForced) {
    return 'light';
  }
  return 'auto';
}
