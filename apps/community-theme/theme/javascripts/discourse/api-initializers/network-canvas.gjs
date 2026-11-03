import { apiInitializer } from "discourse/lib/api";
import CommunityTitle from "../components/community-title";
import LandingPage from "../components/landing/landing-page";
import SiteNavigation from "../components/site-navigation";

export default apiInitializer((api) => {
  api.renderInOutlet("above-site-header", SiteNavigation);
  api.renderInOutlet("home-logo-contents", CommunityTitle);
  // Shown at "/" because about.json sets the custom_homepage modifier.
  api.renderInOutlet("custom-homepage", LandingPage);
});
