import { apiInitializer } from "discourse/lib/api";
import ForumHome from "../components/forum-home";
import LandingPage from "../components/landing/landing-page";
import SiteBrand from "../components/site-brand";
import SiteMenu from "../components/site-menu";
import SiteNavigation from "../components/site-navigation";
import { NETWORK_CANVAS } from "../lib/site-links";

export default apiInitializer((api) => {
  // The shared site header sits after Discourse's logo, which it replaces
  // while it shows (header.scss). The logo stays for a docked topic title and
  // for a page the header never loads on, and goes to the website, as the
  // header's does.
  api.registerValueTransformer("home-logo-href", () => NETWORK_CANVAS);
  api.renderInOutlet("home-logo-contents", SiteBrand);
  api.renderInOutlet("home-logo-wrapper__after", SiteNavigation);
  // Community in the header opens the forum's menu, so pressing it is not a
  // press outside the menu that should close it first.
  api.registerValueTransformer(
    "hamburger-dropdown-click-outside-exceptions",
    ({ value, context }) =>
      context?.event
        ?.composedPath()
        .some((node) => node.part?.contains("host-menu-trigger"))
        ? [...value, "nc-site-navigation"]
        : value
  );
  api.renderInOutlet("before-sidebar-sections", ForumHome);
  api.renderInOutlet("after-sidebar-sections", SiteMenu);
  // Shown at "/" because about.json sets the custom_homepage modifier.
  api.renderInOutlet("custom-homepage", LandingPage);
});
