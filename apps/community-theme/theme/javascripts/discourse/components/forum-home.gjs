import Section from "discourse/components/sidebar/section";
import SectionLink from "discourse/components/sidebar/section-link";
import getURL from "discourse/lib/get-url";
import { i18n } from "discourse-i18n";

/**
 * The forum's home page, first in the forum's menu. The logo, which
 * Discourse makes the way home, goes to the website (site-brand.gjs), as it
 * does on every Network Canvas site.
 */
const ForumHome = <template>
  <Section
    @sectionName="nc-forum-home"
    @hideSectionHeader={{true}}
    @collapsable={{false}}
  >
    <SectionLink
      @linkName="nc-forum-home"
      @href={{getURL "/"}}
      @content={{i18n "home"}}
      @prefixType="icon"
      @prefixValue="house"
    />
  </Section>
</template>;

export default ForumHome;
