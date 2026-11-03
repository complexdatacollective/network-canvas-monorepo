import { apiInitializer } from "discourse/lib/api";
import CommunityTitle from "../components/community-title";
import SiteNavigation from "../components/site-navigation";

export default apiInitializer((api) => {
  api.renderInOutlet("above-site-header", SiteNavigation);
  api.renderInOutlet("home-logo-contents", CommunityTitle);
});
