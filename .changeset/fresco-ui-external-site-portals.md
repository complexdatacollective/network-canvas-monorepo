---
'@codaco/fresco-ui': minor
---

SiteNavigation accepts `site="external"` for non-Network-Canvas hosts (every destination renders as an absolute URL) and portals its desktop menus into the `PortalContainerProvider` container when one is present, so embedders can keep popups inside their own DOM scope (e.g. a shadow root).
