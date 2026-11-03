import { apiInitializer } from "discourse/lib/api";
import CommunityTitle from "../components/community-title";
import LandingPage from "../components/landing/landing-page";
import SiteMark from "../components/site-mark";
import SiteMenu from "../components/site-menu";
import SiteNavigation from "../components/site-navigation";

export default apiInitializer((api) => {
  api.renderInOutlet("above-site-header", SiteNavigation);
  // The mark and the site's links in the forum's menu stand in for the
  // shared header where the theme hides it (header.scss).
  api.renderInOutlet("header-contents__before", SiteMark);
  api.renderInOutlet("after-sidebar-sections", SiteMenu);
  api.renderInOutlet("home-logo-contents", CommunityTitle);
  // Shown at "/" because about.json sets the custom_homepage modifier.
  api.renderInOutlet("custom-homepage", LandingPage);
});
