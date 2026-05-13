---
"@codaco/tailwind-config": patch
---

Add `./fresco/utilities.css` to the package's exports field. The file already shipped, but was missing from `exports`, so consumers (notably `@codaco/fresco-ui@2.1.0`'s compiled CSS) couldn't resolve `@codaco/tailwind-config/fresco/utilities.css` under the `style`/`production`/`import` conditions and storybook builds failed with "is not exported under the conditions".
