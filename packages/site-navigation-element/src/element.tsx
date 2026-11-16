import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SiteNavigation, {
  type SiteNavigationFit,
  type SiteNavigationItemId,
  type SiteNavigationLayout,
  type SiteNavigationLocale,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import { siteNavigationMessages } from '@codaco/fresco-ui/navigation/SiteNavigation.messages';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';

import { ensureDocumentStyles } from './documentStyles';

import shadowCss from '../.generated/shadow.css?inline';

const TAG_NAME = 'nc-site-navigation';

const ACTIVE_ITEMS: readonly SiteNavigationItemId[] = [
  'home',
  'community',
  'documentation',
  'protocolGallery',
  'updates',
  'resources',
  'software',
  'getStarted',
];
// Every language the header has words for. Its messages cover exactly the
// languages the Network Canvas websites offer (they satisfy
// `Record<SiteLocale, …>`), so a language added to the websites reaches the
// element without a second list to update.
const LOCALES = Object.keys(siteNavigationMessages).filter(
  (value): value is SiteNavigationLocale =>
    Object.hasOwn(siteNavigationMessages, value),
);
const THEMES = ['light', 'dark', 'auto'] as const;
type Theme = (typeof THEMES)[number];
const LAYOUTS: readonly SiteNavigationLayout[] = ['header', 'embedded', 'menu'];
const HOST_MENU_STATES = ['open', 'closed'] as const;

/**
 * Dispatched when the visitor uses the host's entry in the embedded header,
 * so the host can open or close its own menu. `detail.anchor` is where the
 * entry is on the page, to hang the menu from.
 */
const HOST_MENU_TOGGLE_EVENT = 'nc-host-menu-toggle';

// The custom state (`nc-site-navigation:state(links)`) an embedded header
// carries while its links show, so the host's styles can leave out what the
// header already offers, such as its own menu button.
const LINKS_STATE = 'links';

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
  // oxlint-disable-next-line no-console -- only way a host page embedding this custom element learns its attribute value was invalid
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
  // oxlint-disable-next-line no-console -- only way a host page embedding this custom element learns its attribute value was invalid
  console.warn(
    `<${TAG_NAME}>: ignoring empty ${name} (expected the id of an element on the page)`,
  );
  return fallback;
}

class NcSiteNavigation extends HTMLElement {
  static observedAttributes = [
    'active-item',
    'host-menu',
    'layout',
    'locale',
    'skip-to-id',
    'theme',
  ];

  #internals: ElementInternals | undefined;
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

  /**
   * Moves focus to the host's entry in the embedded header, for a host that
   * closes its menu from the keyboard. Returns whether there was one.
   */
  focusHostMenuTrigger(): boolean {
    const trigger = this.shadowRoot?.querySelector<HTMLElement>(
      '[part~="host-menu-trigger"]',
    );
    trigger?.focus();
    return trigger !== null && trigger !== undefined;
  }

  #handleHostMenuToggle = (trigger: HTMLElement) => {
    this.dispatchEvent(
      new CustomEvent(HOST_MENU_TOGGLE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { anchor: trigger.getBoundingClientRect() },
      }),
    );
  };

  #handleFitChange = (fit: SiteNavigationFit) => {
    this.#setState(LINKS_STATE, fit !== 'brand');
  };

  /**
   * Custom states let a host's styles follow the element. A browser without
   * them (Safari before 17.4, Chrome before 125) leaves the host's styles
   * as they are rather than failing to render the header.
   */
  #setState(name: string, on: boolean) {
    try {
      this.#internals ??= this.attachInternals();
      if (on) this.#internals.states.add(name);
      else this.#internals.states.delete(name);
    } catch {
      // Unsupported; see above.
    }
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
    const layout =
      parseAttribute(this, 'layout', LAYOUTS, 'header') ?? 'header';
    const hostMenu = parseAttribute(
      this,
      'host-menu',
      HOST_MENU_STATES,
      undefined,
    );
    // The layout the element renders, as a state (`:state(embedded)`,
    // `:state(menu)`), so a host can keep its own header in place until a
    // version of the element that has the layout arrives.
    for (const name of LAYOUTS) this.#setState(name, name === layout);
    if (layout !== 'embedded') this.#setState(LINKS_STATE, false);

    this.#reactRoot.render(
      <StrictMode>
        <div
          // Embedded in a host's header or menu, the header takes the
          // host's background rather than painting the page's.
          className={
            layout === 'header'
              ? 'nc-root bg-background text-text'
              : 'nc-root text-text'
          }
          data-theme={resolvedTheme}
        >
          <PortalContainerProvider>
            <SiteNavigation
              activeItemId={activeItemId}
              hostMenu={
                hostMenu
                  ? {
                      open: hostMenu === 'open',
                      onToggle: this.#handleHostMenuToggle,
                    }
                  : undefined
              }
              layout={layout}
              locale={locale}
              onFitChange={this.#handleFitChange}
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
