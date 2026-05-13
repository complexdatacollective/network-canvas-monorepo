---
"@codaco/interview": prerelease
---

Sync with `@codaco/tailwind-config@1.0.0-alpha.11` and `@codaco/fresco-ui@2.5.4`. The dev/test host CSS (`styles/host.css`, used only by the e2e Vite host and Storybook preview) drops its now-redundant `@import "tailwindcss"` — that line is now owned by `@codaco/tailwind-config/fresco.css` and was loading Tailwind's runtime twice. No published interview-package source change.
