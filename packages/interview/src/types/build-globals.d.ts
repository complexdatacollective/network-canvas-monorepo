declare const __PACKAGE_VERSION__: string;

// Set by Storybook and the e2e host before mounting Shell, to suppress
// Base UI's CSS-animation waits during automated runs (Chromatic /
// Playwright). Read by base-ui's runtime; we only assign it. Declared
// with `var` (not `let`/`const`) so it surfaces on `globalThis`, which is
// how it's actually written from the consumer side.
declare var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
