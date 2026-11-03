/**
 * The links the shared site header offers a site other than the website and
 * the documentation (fresco-ui navigation/SiteNavigation.tsx), less the
 * forum's own. Where the theme hides that header (header.scss), the forum's
 * menu carries them instead. Each `label` is a key of the header's own
 * messages, which the theme's translations repeat (src/locales.ts); a test
 * holds the addresses to the header's.
 */
const NETWORK_CANVAS = 'https://networkcanvas.com/';

/** The site's pages, for a visitor reading `siteLocale`. */
export function siteLinks(siteLocale) {
  return [
    { name: 'home', label: 'home', href: NETWORK_CANVAS },
    {
      name: 'documentation',
      label: 'documentation',
      href: 'https://documentation.networkcanvas.com/',
    },
    // Another host cannot read the website's locale cookie, so the link says
    // which language the visitor is already reading, as the header's does.
    {
      name: 'updates',
      label: 'updates',
      href: `${NETWORK_CANVAS}${siteLocale}/updates/`,
    },
    {
      name: 'protocol-gallery',
      label: 'protocolGallery',
      href: 'https://protocolgallery.networkcanvas.com/',
    },
    {
      name: 'get-started',
      label: 'getStarted',
      href: `${NETWORK_CANVAS}download`,
    },
  ];
}

/** The software, in the header's order. */
export const SOFTWARE_LINKS = [
  { name: 'architect', href: 'https://architect.networkcanvas.com/' },
  { name: 'interviewer', href: 'https://interviewer.networkcanvas.com/' },
  { name: 'fresco', href: 'https://fresco-sandbox.networkcanvas.com/' },
  {
    name: 'architectClassic',
    href: `${NETWORK_CANVAS}get-started#architect-classic-downloads`,
  },
  {
    name: 'interviewerClassic',
    href: `${NETWORK_CANVAS}get-started#interviewer-classic-downloads`,
  },
];
