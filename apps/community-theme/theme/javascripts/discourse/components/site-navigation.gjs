import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import { menuStart } from "../lib/menu-start";
import {
  loadSiteNavigation,
  siteNavigationLocale,
  siteNavigationTheme,
} from "../lib/site-navigation-element";

/**
 * The shared site header inside Discourse's header, so the forum has one
 * header with the website and the documentation: the header's own logo and
 * links (`<nc-site-navigation layout="embedded">`), then the forum's search
 * and account controls. Community, the forum's entry in it, opens the
 * forum's own menu, so every page of the forum and every member's and
 * moderator's link stays one click away. While a topic's title is docked in
 * the header, the forum's logo and the title take its place.
 */
export default class SiteNavigation extends Component {
  @service header;
  @service interfaceColor;
  @service search;
  @service session;

  // Whether Community opened the menu that is open, so Escape in it comes
  // back there; Discourse would send focus to its own menu button, which is
  // hidden while the header's links show (header.scss).
  openedHere = false;

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

  closeOnEscape = modifier((element, [open]) => {
    if (!open || !this.openedHere) {
      this.openedHere = false;
      return;
    }
    const onKeydown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        this.header.hamburgerVisible = false;
        element.focusHostMenuTrigger?.();
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });

  @action
  toggle(event) {
    const opening = !this.header.hamburgerVisible;
    if (opening) {
      // Discourse draws the menu under its own controls; header.scss moves
      // it under Community.
      const header = event.currentTarget.closest(".d-header");
      const panel = header?.querySelector(".contents > .panel");
      if (panel && event.detail?.anchor) {
        const start = menuStart(
          event.detail.anchor,
          panel.getBoundingClientRect(),
          getComputedStyle(panel).direction
        );
        header.style.setProperty("--nc-forum-menu-start", `${start}px`);
      }
      this.search.visible = false;
      this.header.userVisible = false;
    }
    this.openedHere = opening;
    this.header.hamburgerVisible = opening;
  }

  <template>
    {{#unless this.header.topicInfoVisible}}
      <nc-site-navigation
        layout="embedded"
        active-item="community"
        host-menu={{if this.header.hamburgerVisible "open" "closed"}}
        locale={{this.locale}}
        theme={{this.theme}}
        {{on "nc-host-menu-toggle" this.toggle}}
        {{this.closeOnEscape this.header.hamburgerVisible}}
      ></nc-site-navigation>
    {{/unless}}
  </template>
}
