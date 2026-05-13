---
"@codaco/tailwind-config": prerelease
---

Add a `build` script that compiles the Tailwind plugin TypeScript sources to `.js` siblings via tsc. Wired into `prepublishOnly` so published tarballs always include both source `.ts` and compiled `.js`. Resolves "Unable to load plugin" failures from `eslint-plugin-better-tailwindcss` (whose resolver only knows `.js`/`.cjs`, not `.ts`). Also bundles `@plugin '@tailwindcss/forms'` into the `fresco.css` barrel so consumers don't have to declare it themselves.
