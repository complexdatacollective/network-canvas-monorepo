// Portable worker construction. `new Worker(new URL(...), { type: 'module' })`
// is the web-standard form and is understood by every bundler that consumes
// this package's *source* — Vite (Interviewer, Architect, Storybook) and
// non-Vite bundlers alike (Turbopack, for the Next.js apps).
//
// The published `dist` cannot use this form: a library-mode worker chunk emits
// an absolute `/assets/<hash>.js` URL that consumer bundlers cannot resolve.
// So the library build swaps this module for `createSearchWorker.inline.ts`,
// which uses Vite's `?worker&inline` to bake the worker into a blob URL and
// keep dist self-contained. See the `inlineWorkerPlugin` in vite.config.ts.
export function createSearchWorker(): Worker {
  return new Worker(new URL('./search.worker.ts', import.meta.url), {
    type: 'module',
  });
}
