---
'@codaco/tailwind-config': prerelease
---

Move the `interview:` and `dashboard:` `@custom-variant` declarations into the `fresco.css` barrel. They were previously in `@codaco/fresco-ui/styles.css`, which forced any host-CSS that wanted to use them (including the interview package's own Storybook and e2e host) to import the fresco-ui CSS entry. With them in the foundation barrel, any consumer that imports `@codaco/tailwind-config/fresco.css` gets the full set of Fresco design-system primitives — utilities, plugins, and these app-scoped variants — in one go.
