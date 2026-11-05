/**
 * The links the shared site header offers a site other than the website and
 * the documentation (fresco-ui navigation/SiteNavigation.tsx), less the
 * forum's own. The forum's header shows them as that header does
 * (components/site-navigation.gjs), and where it has no room for them the
 * forum's menu carries them instead (components/site-menu.gjs). Each `label`
 * is a key of the header's own messages, which the theme's translations
 * repeat (src/locales.ts); a test holds the addresses to the header's.
 */
export const NETWORK_CANVAS = 'https://networkcanvas.com/';

/**
 * The site's pages, for a visitor reading `siteLocale`. The header lists the
 * `resource` pages beside the forum's own entry, and collapses them into one
 * menu where it is short of room, as the shared header does.
 */
export function siteLinks(siteLocale) {
  return [
    { name: 'home', label: 'home', href: NETWORK_CANVAS },
    {
      name: 'documentation',
      label: 'documentation',
      href: 'https://documentation.networkcanvas.com/',
      resource: true,
    },
    // Another host cannot read the website's locale cookie, so the link says
    // which language the visitor is already reading, as the header's does.
    {
      name: 'updates',
      label: 'updates',
      href: `${NETWORK_CANVAS}${siteLocale}/updates/`,
      resource: true,
    },
    {
      name: 'protocol-gallery',
      label: 'protocolGallery',
      href: 'https://protocolgallery.networkcanvas.com/',
      resource: true,
    },
    {
      name: 'get-started',
      label: 'getStarted',
      href: `${NETWORK_CANVAS}download`,
    },
  ];
}

/**
 * The software, in the header's order. `icon` names the theme asset that
 * carries the header's icon for it (src/theme.ts).
 */
export const SOFTWARE_LINKS = [
  {
    name: 'architect',
    href: 'https://architect.networkcanvas.com/',
    icon: 'nc-app-architect',
  },
  {
    name: 'interviewer',
    href: 'https://interviewer.networkcanvas.com/',
    icon: 'nc-app-interviewer',
  },
  {
    name: 'fresco',
    href: 'https://fresco-sandbox.networkcanvas.com/',
    icon: 'nc-app-fresco',
  },
  {
    name: 'architectClassic',
    href: `${NETWORK_CANVAS}get-started#architect-classic-downloads`,
    icon: 'nc-app-architect-classic',
  },
  {
    name: 'interviewerClassic',
    href: `${NETWORK_CANVAS}get-started#interviewer-classic-downloads`,
    icon: 'nc-app-interviewer-classic',
  },
];
