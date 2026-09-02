import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SiteNavigation, {
  type SiteNavigationItemId,
  type SiteNavigationLocale,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';

import { ensureDocumentStyles } from './documentStyles';

import shadowCss from '../.generated/shadow.css?inline';

const TAG_NAME = 'nc-site-navigation';

const ACTIVE_ITEMS: readonly SiteNavigationItemId[] = [
  'home',
  'community',
  'documentation',
  'protocolGallery',
  'resources',
  'software',
  'getStarted',
];
const LOCALES: readonly SiteNavigationLocale[] = ['en-US', 'en-GB', 'es'];
const THEMES = ['light', 'dark', 'auto'] as const;
type Theme = (typeof THEMES)[number];

// Preflight's html/body rules can't reach into the shadow tree, so the
// wrapper re-establishes the base typography itself.
const HOST_CSS = `
:host { display: block; }
.nc-root { font-family: var(--body-font); }
`;

let sharedSheet: CSSStyleSheet | null = null;
function shadowStyles(): CSSStyleSheet {
  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(`${shadowCss}\n${HOST_CSS}`);
  }
  return sharedSheet;
}

function parseAttribute<T extends string>(
  host: HTMLElement,
  name: string,
  allowed: readonly T[],
  fallback: T | undefined,
): T | undefined {
  const value = host.getAttribute(name);
  if (value === null) return fallback;
  const match = allowed.find((candidate) => candidate === value);
  if (match !== undefined) return match;
  console.warn(
    `<${TAG_NAME}>: ignoring invalid ${name}="${value}" (expected one of: ${allowed.join(', ')})`,
  );
  return fallback;
}

/**
 * Reads a free-form attribute that names something on the host page. Unlike
 * `parseAttribute` there is no allow-list to check it against, so the only
 * rejectable value is an empty one.
 */
function parseIdAttribute(
  host: HTMLElement,
  name: string,
  fallback: string,
): string {
  const value = host.getAttribute(name);
  if (value === null) return fallback;
  const trimmed = value.trim();
  if (trimmed !== '') return trimmed;
  console.warn(
    `<${TAG_NAME}>: ignoring empty ${name} (expected the id of an element on the page)`,
  );
  return fallback;
}

class NcSiteNavigation extends HTMLElement {
  static observedAttributes = ['active-item', 'locale', 'skip-to-id', 'theme'];

  #reactRoot: Root | null = null;
  #colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  #handleSchemeChange = () => {
    if (parseAttribute(this, 'theme', THEMES, 'auto') === 'auto') {
      this.#render();
    }
  };

  connectedCallback() {
    ensureDocumentStyles();
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [shadowStyles()];
    this.#reactRoot ??= createRoot(shadow);
    this.#colorScheme.addEventListener('change', this.#handleSchemeChange);
    this.#render();
  }

  disconnectedCallback() {
    this.#colorScheme.removeEventListener('change', this.#handleSchemeChange);
    this.#reactRoot?.unmount();
    this.#reactRoot = null;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #render() {
    if (!this.#reactRoot) return;
    const activeItemId = parseAttribute(
      this,
      'active-item',
      ACTIVE_ITEMS,
      undefined,
    );
    const locale = parseAttribute(this, 'locale', LOCALES, 'en-US') ?? 'en-US';
    const skipToId = parseIdAttribute(
      this,
      'skip-to-id',
      SITE_NAVIGATION_SKIP_TARGET_ID,
    );
    const theme: Theme =
      parseAttribute(this, 'theme', THEMES, 'auto') ?? 'auto';
    const resolvedTheme =
      theme === 'auto' ? (this.#colorScheme.matches ? 'dark' : 'light') : theme;

    this.#reactRoot.render(
      <StrictMode>
        <div
          className="nc-root bg-background text-text"
          data-theme={resolvedTheme}
        >
          <PortalContainerProvider>
            <SiteNavigation
              activeItemId={activeItemId}
              locale={locale}
              site="external"
              skipToId={skipToId}
            />
          </PortalContainerProvider>
        </div>
      </StrictMode>,
    );
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, NcSiteNavigation);
}
