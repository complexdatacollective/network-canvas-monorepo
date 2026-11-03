---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': minor
---

Three new exports for tools that build other surfaces from the shared design system. `@codaco/tailwind-config/theme-colors` resolves a theme token to the colour a browser would paint (`buildScopes()`, then `scope.computed()` for the token's CSS or `toDisplayColor(scope.token())` for clipped sRGB), using the resolver the contrast tests already relied on. `@codaco/tailwind-config/elevation` gives the `box-shadow` of each `elevation-*` utility as plain CSS (`elevationShadow('low')`), for styling elements without Tailwind. `@codaco/fresco-ui/navigation/SiteNavigation.messages` exposes the site header's translated labels (`siteNavigationMessages`) without loading the React component.
