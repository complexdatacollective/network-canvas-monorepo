import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import icon from "discourse/helpers/d-icon";
import DMenu from "discourse/float-kit/components/d-menu";
import I18n, { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";
import { SOFTWARE_LINKS, siteLinks } from "../lib/site-links";
import { siteLocaleFor } from "../lib/site-locale";

// One of the shared header's messages (`site.*` in the theme's translations).
function label(key) {
  return i18n(themePrefix(`site.${key}`));
}

// What the header shows, from the most to the least: every link and the
// logo's name; the site's pages in one menu ("compact"); and that menu with
// the mark alone. Below 65rem the links leave the header for the forum's
// menu (header.scss), and only the name is in question.
const FITS = ["full", "compact", "mark"];

// The least space between the logo, the links and the forum's controls.
const MIN_GAP = 24;

// How far below a link its menu opens: under the header, which is 5rem tall
// wherever the links show (header.scss).
const MENU_OFFSET = 24;

// The Software menu sets its own width (header.scss); this only lifts
// Discourse's 400px cap on its menus.
const SOFTWARE_MENU_MAX_WIDTH = 1200;

/**
 * Sets the header's `data-nc-fit` to the first arrangement in FITS in which
 * the logo, the links and Discourse's own controls sit side by side. The
 * room depends on the language, on whether the visitor is signed in and on
 * what plugins add to the controls, so the header measures it rather than
 * assuming widths.
 */
const fitHeader = modifier((nav) => {
  const header = nav.closest(".d-header");
  const contents = nav.closest(".contents");
  const panel = contents?.querySelector(":scope > .panel");
  if (!header || !contents || !panel) {
    return;
  }

  const hasRoom = () => {
    const brand = header.querySelector(".nc-brand");
    if (!brand) {
      return true;
    }
    const end =
      contents.getBoundingClientRect().right -
      parseFloat(getComputedStyle(contents).paddingRight);
    const panelBox = panel.getBoundingClientRect();
    const next = nav.offsetParent ? nav.getBoundingClientRect() : panelBox;
    return (
      panelBox.right <= end + 0.5 &&
      next.left - brand.getBoundingClientRect().right >= MIN_GAP
    );
  };

  let frame = 0;
  let stopped = false;
  const fit = () => {
    for (const arrangement of FITS) {
      header.dataset.ncFit = arrangement;
      if (hasRoom()) {
        return;
      }
    }
  };
  const schedule = () => {
    if (stopped) {
      return;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };

  const observer = new ResizeObserver(schedule);
  observer.observe(contents);
  observer.observe(panel);
  document.fonts?.ready.then(schedule);
  // Measured now as well, so the links never show a frame in an
  // arrangement that does not fit when they come back after a topic's title.
  fit();

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    delete header.dataset.ncFit;
  };
});

// The Community link, which opens the forum's menu (the initializer keeps a
// click on it from counting as a click outside that menu).
export const FORUM_MENU_BUTTON = ".nc-site-nav__forum-menu";

/**
 * The forum's entry in the header. It opens the forum's own menu, the one
 * Discourse's menu button opens where the header has no room for it, so
 * every page of the forum and every member's and moderator's link stays one
 * click away.
 */
class ForumMenuButton extends Component {
  @service header;
  @service search;

  // Whether this button opened the menu that is open, so Escape in it comes
  // back here; Discourse would send focus to its own menu button, which is
  // hidden while this one shows.
  openedHere = false;

  closeOnEscape = modifier((button, [open]) => {
    if (!open || !this.openedHere) {
      this.openedHere = false;
      return;
    }
    const onKeydown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        this.header.hamburgerVisible = false;
        button.focus();
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
      // it under this button.
      const button = event.currentTarget;
      const panel = button
        .closest(".contents")
        ?.querySelector(":scope > .panel");
      if (panel) {
        button
          .closest(".d-header")
          .style.setProperty(
            "--nc-forum-menu-start",
            `${button.getBoundingClientRect().left - panel.getBoundingClientRect().left}px`
          );
      }
      this.search.visible = false;
      this.header.userVisible = false;
    }
    this.openedHere = opening;
    this.header.hamburgerVisible = opening;
  }

  <template>
    <button
      type="button"
      class="nc-site-nav__link nc-site-nav__forum-menu"
      aria-current="page"
      aria-expanded={{if this.header.hamburgerVisible "true" "false"}}
      {{on "click" this.toggle}}
      {{this.closeOnEscape this.header.hamburgerVisible}}
    >
      {{i18n (themePrefix "community")}}
      {{icon "chevron-down"}}
    </button>
  </template>
}

// The menus open from links like the others, not from Discourse's buttons.
// The menu sets the trigger's class, expanded state and listeners on it.
const MenuTrigger = <template>
  <button type="button" ...attributes>{{yield}}</button>
</template>;

const ResourcesMenu = <template>
  <DMenu
    @identifier="nc-resources"
    @triggerComponent={{MenuTrigger}}
    @triggerClass="nc-site-nav__link"
    @placement="bottom"
    @offset={{MENU_OFFSET}}
  >
    <:trigger>
      {{label "resources"}}
      {{icon "chevron-down"}}
    </:trigger>
    <:content as |menu|>
      <ul class="nc-site-menu-list">
        {{#each @links as |link|}}
          <li>
            <a
              class="nc-site-menu-list__link"
              href={{link.href}}
              target="_blank"
              rel="noreferrer"
              {{on "click" menu.close}}
            >
              {{link.text}}
              {{icon "up-right-from-square"}}
            </a>
          </li>
        {{/each}}
      </ul>
    </:content>
  </DMenu>
</template>;

const SoftwareMenu = <template>
  <DMenu
    @identifier="nc-software"
    @triggerComponent={{MenuTrigger}}
    @triggerClass="nc-site-nav__link"
    @placement="bottom"
    @offset={{MENU_OFFSET}}
    @maxWidth={{SOFTWARE_MENU_MAX_WIDTH}}
  >
    <:trigger>
      {{label "software"}}
      {{icon "chevron-down"}}
    </:trigger>
    <:content as |menu|>
      <ul class="nc-software-menu">
        {{#each @links as |link|}}
          <li>
            <a
              class="nc-software-menu__link"
              data-software={{link.name}}
              href={{link.href}}
              target="_blank"
              rel="noreferrer"
              aria-label={{link.title}}
              {{on "click" menu.close}}
            >
              <img class="nc-software-menu__icon" src={{link.iconUrl}} alt="" />
              <span class="nc-software-menu__text">
                <span class="nc-software-menu__name">{{link.title}}</span>
                <span
                  class="nc-software-menu__description"
                >{{link.description}}</span>
                <span class="nc-software-menu__action">
                  {{link.action}}
                  {{icon "up-right-from-square"}}
                </span>
              </span>
            </a>
          </li>
        {{/each}}
      </ul>
    </:content>
  </DMenu>
</template>;

/**
 * The shared site header's links, inside Discourse's header, so the forum has
 * one header with the website and the documentation: the logo
 * (site-brand.gjs), the forum's own entry, the site's pages and its
 * software, then the forum's search and account controls. While a topic's
 * title is docked in the header the links make way for it.
 */
export default class SiteNavigation extends Component {
  get siteLocale() {
    return siteLocaleFor(I18n.currentLocale());
  }

  get resources() {
    return siteLinks(this.siteLocale)
      .filter((link) => link.resource)
      .map((link) => ({ ...link, text: label(link.label) }));
  }

  get software() {
    return SOFTWARE_LINKS.map((link) => ({
      name: link.name,
      href: link.href,
      iconUrl: settings.theme_uploads?.[link.icon],
      title: label(`softwareLinks.${link.name}.name`),
      description: label(`softwareLinks.${link.name}.description`),
      action: label(`softwareLinks.${link.name}.action`),
    }));
  }

  <template>
    {{#unless @outletArgs.topicInfoVisible}}
      <nav
        class="nc-site-nav"
        aria-label={{label "navigationLabel"}}
        {{fitHeader}}
      >
        <ul class="nc-site-nav__list nc-site-nav__list--full">
          <li><ForumMenuButton /></li>
          {{#each this.resources as |link|}}
            <li>
              <a
                class="nc-site-nav__link"
                href={{link.href}}
                target="_blank"
                rel="noreferrer"
              >{{link.text}}</a>
            </li>
          {{/each}}
          <li><SoftwareMenu @links={{this.software}} /></li>
        </ul>
        <ul class="nc-site-nav__list nc-site-nav__list--compact">
          <li><ForumMenuButton /></li>
          <li><ResourcesMenu @links={{this.resources}} /></li>
          <li><SoftwareMenu @links={{this.software}} /></li>
        </ul>
      </nav>
    {{/unless}}
  </template>
}
