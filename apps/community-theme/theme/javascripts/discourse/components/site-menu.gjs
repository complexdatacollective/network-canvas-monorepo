import Component from "@glimmer/component";
import Section from "discourse/components/sidebar/section";
import SectionLink from "discourse/components/sidebar/section-link";
import I18n, { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";
import { SOFTWARE_LINKS, siteLinks } from "../lib/site-links";
import { siteLocaleFor } from "../lib/site-locale";

// One of the shared header's messages (`site.*` in the theme's translations).
function label(key) {
  return i18n(themePrefix(`site.${key}`));
}

/**
 * The shared site header's links, as two sections at the foot of the forum's
 * menu. They show only where the theme hides that header (header.scss), so
 * the forum has one menu there instead of two. Every link leaves the forum,
 * which its icon says. They sit in the menu's plugin outlet because Discourse
 * shows sections added through its sidebar API only to members who are
 * signed in.
 */
export default class SiteMenu extends Component {
  get siteLinks() {
    return siteLinks(siteLocaleFor(I18n.currentLocale())).map((link) => ({
      ...link,
      text: label(link.label),
    }));
  }

  get softwareLinks() {
    return SOFTWARE_LINKS.map((link) => ({
      ...link,
      text: label(`softwareLinks.${link.name}`),
    }));
  }

  get softwareTitle() {
    return label("software");
  }

  <template>
    <div class="nc-site-menu">
      <Section
        @sectionName="nc-site"
        @headerLinkText="Network Canvas"
        @collapsable={{false}}
      >
        {{#each this.siteLinks as |link|}}
          <SectionLink
            @linkName={{link.name}}
            @href={{link.href}}
            @title={{link.text}}
            @content={{link.text}}
            @prefixType="icon"
            @prefixValue="up-right-from-square"
          />
        {{/each}}
      </Section>
      <Section
        @sectionName="nc-software"
        @headerLinkText={{this.softwareTitle}}
        @collapsable={{false}}
      >
        {{#each this.softwareLinks as |link|}}
          <SectionLink
            @linkName={{link.name}}
            @href={{link.href}}
            @title={{link.text}}
            @content={{link.text}}
            @prefixType="icon"
            @prefixValue="up-right-from-square"
          />
        {{/each}}
      </Section>
    </div>
  </template>
}
