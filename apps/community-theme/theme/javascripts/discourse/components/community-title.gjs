import HomeLogoContents from "discourse/components/header/home-logo-contents";
import { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";

/**
 * What Discourse's home link shows. The shared header above already carries
 * the Network Canvas logo, so a second full logo here would repeat it; the
 * link names the forum instead, after a speech bubble that marks the bar as
 * the forum's. Scrolled down a topic, where Discourse shrinks the header to
 * fit the topic title, it keeps the forum's small logo.
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
    <span class="nc-community-title">
      <svg
        class="nc-community-title__mark"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20 15.5a2 2 0 0 1-2 2H8.5L4 21V5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
      </svg>
      {{i18n (themePrefix "community")}}
    </span>
  {{/if}}
</template>;

export default CommunityTitle;
