---
'@codaco/tailwind-config': prerelease
---

Effective fix for the consumer-side `Unable to load plugin: ../shared/plugins/elevation` (and `inset-surface` / `motion-spring`) failures from `eslint-plugin-better-tailwindcss`. The `1.0.0-alpha.12` release intended to ship compiled `.js` siblings via `prepublishOnly: tsc -p tsconfig.build.json`, but `npm publish` honors `.gitignore` when no `.npmignore` is present, and the `shared/plugins/**/*.js` ignore rule was excluding the just-emitted artifacts from the tarball — so alpha-12 shipped `.ts`-only, identical to alpha-11.

Adds an explicit `"files"` field to `package.json` (`["fresco/**", "shared/**", "tsconfig*.json"]`). The `files` field overrides `.gitignore` for npm-publish purposes, so the compiled plugin `.js` files now land in the tarball alongside their `.ts` siblings:

```
package/shared/plugins/elevation/{elevation,jwc,utils,index}.{ts,js}
package/shared/plugins/inset-surface/{inset-surface,index}.{ts,js}
package/shared/plugins/motion-spring.{ts,js}
```

Tailwind itself still loads the `.ts` directly via its bundled jiti loader; the `.js` exists for tooling that does its own plugin resolution and only knows `.js`/`.cjs` extensions (notably `eslint-plugin-better-tailwindcss` / `enhanced-resolve`).

Also adds a `@codaco/tailwind-config#build` override in the workspace's `turbo.json` so this package's task hashing reflects its actual sources (`shared/plugins/**/*.ts`) and outputs (`shared/plugins/**/*.js`) rather than the generic `src/**` / `dist/**` defaults.
