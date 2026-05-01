---
'@codaco/fresco-ui': minor
---

Move `@codaco/tailwind-config` from `dependencies` to `peerDependencies`. Tailwind v4's CSS resolver walks `node_modules/` from the consuming `.css` file's directory upward; pnpm doesn't hoist transitive deps, so the `@plugin` directives in `dist/styles.css` couldn't resolve in consumer projects. As a peer dep, pnpm with `auto-install-peers` (the default) hoists it correctly. Consumers without `auto-install-peers` need to install `@codaco/tailwind-config` themselves.
