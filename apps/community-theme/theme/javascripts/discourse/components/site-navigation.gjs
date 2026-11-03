import Component from "@glimmer/component";
import { service } from "@ember/service";
import I18n from "discourse-i18n";
import { settings } from "virtual:theme";
import { siteLocaleFor } from "../lib/site-locale";

const TAG_NAME = "nc-site-navigation";

// The id of Discourse's main content container, which its own skip link
// targets too.
const MAIN_CONTENT_ID = "main-container";

/**
 * Loads the shared header's custom element once per page. The element is a
 * self-contained bundle (React, styles and fonts included), so a script tag is
 * all it needs; the tag renders nothing until the definition arrives, and the
 * rest of the forum is unaffected if it never does.
 */
function loadElement() {
  if (
    customElements.get(TAG_NAME) ||
    document.querySelector(`script[data-${TAG_NAME}]`)
  ) {
    return;
  }

  const script = document.createElement("script");
  script.type = "module";
  script.src = settings.site_navigation_script_url;
  script.setAttribute(`data-${TAG_NAME}`, "");
  document.head.append(script);
}

/**
 * The Network Canvas site header, above Discourse's own header. It follows the
 * forum's language and colour mode, so a visitor who switches either sees the
 * header switch with the rest of the page.
 */
export default class SiteNavigation extends Component {
  @service interfaceColor;
  @service session;

  constructor() {
    super(...arguments);
    loadElement();
  }

  get locale() {
    return siteLocaleFor(I18n.currentLocale());
  }

  get theme() {
    if (!this.session.darkModeAvailable) {
      return this.session.defaultColorSchemeIsDark ? "dark" : "light";
    }
    if (this.interfaceColor.darkModeForced) {
      return "dark";
    }
    if (this.interfaceColor.lightModeForced) {
      return "light";
    }
    return "auto";
  }

  <template>
    <nc-site-navigation
      active-item="community"
      locale={{this.locale}}
      theme={{this.theme}}
      skip-to-id={{MAIN_CONTENT_ID}}
    ></nc-site-navigation>
  </template>
}
