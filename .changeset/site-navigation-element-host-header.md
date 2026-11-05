---
'@codaco/site-navigation-element': minor
---

`<nc-site-navigation>` can sit inside a site's own header bar, as it does on the community forum. `layout="embedded"` shows the logo and links alone on the host's background and fits them to the room it is given, folding the pages into Resources and then dropping to the logo; the element matches `:state(links)` while any links show. `layout="menu"` lists the links for the host's own menu. `host-menu` turns the active entry into the button that opens the host's menu: it dispatches `nc-host-menu-toggle`, reports `host-menu="open"` through `aria-expanded`, and `focusHostMenuTrigger()` returns focus to it. The element matches the layout it renders as a custom state (`:state(embedded)`, `:state(menu)`), so a host can keep its own header until a version with the layout arrives. The README's "Inside a host's header" has the details.
