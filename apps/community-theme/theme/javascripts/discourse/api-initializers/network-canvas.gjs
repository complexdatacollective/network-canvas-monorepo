import { apiInitializer } from "discourse/lib/api";
import ForumHome from "../components/forum-home";
import LandingPage from "../components/landing/landing-page";
import SiteBrand from "../components/site-brand";
import SiteMenu from "../components/site-menu";
import SiteNavigation, {
  FORUM_MENU_BUTTON,
} from "../components/site-navigation";
import { NETWORK_CANVAS } from "../lib/site-links";

export default apiInitializer((api) => {
  // Discourse's header is the site's header: the logo goes to the website,
  // and the site's links sit between it and the forum's own controls.
  api.registerValueTransformer("home-logo-href", () => NETWORK_CANVAS);
  api.renderInOutlet("home-logo-contents", SiteBrand);
  api.renderInOutlet("before-header-panel", SiteNavigation);
  // The Community link opens the forum's menu, so a click on it is not a
  // click outside the menu that should close it first.
  api.registerValueTransformer(
    "hamburger-dropdown-click-outside-exceptions",
    ({ value }) => [...value, FORUM_MENU_BUTTON]
  );
  api.renderInOutlet("before-sidebar-sections", ForumHome);
  api.renderInOutlet("after-sidebar-sections", SiteMenu);
  // Shown at "/" because about.json sets the custom_homepage modifier.
  api.renderInOutlet("custom-homepage", LandingPage);
});
