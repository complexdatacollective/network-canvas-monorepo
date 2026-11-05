import Component from "@glimmer/component";
import { service } from "@ember/service";
import {
  loadSiteNavigation,
  siteNavigationLocale,
  siteNavigationTheme,
} from "../lib/site-navigation-element";

/**
 * The shared site header's links, at the foot of the forum's menu, as the
 * header's own compact menu lists them (`<nc-site-navigation layout="menu">`).
 * They show only where the header has room for its logo alone (header.scss),
 * so the forum still has one menu there. They sit in the menu's plugin
 * outlet because Discourse shows sections added through its sidebar API
 * only to members who are signed in.
 */
export default class SiteMenu extends Component {
  @service interfaceColor;
  @service session;

  constructor() {
    super(...arguments);
    loadSiteNavigation();
  }

  get locale() {
    return siteNavigationLocale();
  }

  get theme() {
    return siteNavigationTheme(this.session, this.interfaceColor);
  }

  <template>
    <div class="nc-site-menu">
      <nc-site-navigation
        layout="menu"
        active-item="community"
        locale={{this.locale}}
        theme={{this.theme}}
      ></nc-site-navigation>
    </div>
  </template>
}
