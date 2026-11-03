import HomeLogoContents from "discourse/components/header/home-logo-contents";
import { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";

/**
 * What Discourse's home link shows. The shared header above already carries
 * the Network Canvas logo, so a second full logo here would repeat it; the
 * link names the forum instead. Scrolled down a topic, where Discourse
 * shrinks the header to fit the topic title, it keeps the forum's small logo.
 */
const CommunityTitle = <template>
  {{#if @outletArgs.minimized}}
    <HomeLogoContents
      @logoSmallUrl={{@outletArgs.logoSmallUrl}}
      @logoSmallUrlDark={{@outletArgs.logoSmallUrlDark}}
      @logoUrl={{@outletArgs.logoUrl}}
      @logoUrlDark={{@outletArgs.logoUrlDark}}
      @minimized={{@outletArgs.minimized}}
      @mobileLogoUrl={{@outletArgs.mobileLogoUrl}}
      @mobileLogoUrlDark={{@outletArgs.mobileLogoUrlDark}}
      @showMobileLogo={{@outletArgs.showMobileLogo}}
      @title={{@outletArgs.title}}
    />
  {{else}}
    <span class="nc-community-title">{{i18n (themePrefix "community")}}</span>
  {{/if}}
</template>;

export default CommunityTitle;
