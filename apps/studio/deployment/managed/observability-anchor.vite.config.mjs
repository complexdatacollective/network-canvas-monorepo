import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'dist-anchor',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        'lambda': new URL('./observability-anchor-lambda.mjs', import.meta.url)
          .pathname,
        'authorize-month': new URL(
          './observability-anchor-authorize-month.mjs',
          import.meta.url,
        ).pathname,
        'enroll': new URL('./observability-anchor-enroll.mjs', import.meta.url)
          .pathname,
      },
      output: { entryFileNames: '[name].mjs' },
    },
  },
  ssr: {
    // Lambda gets an exact, locked closure. Do not use its ambient AWS SDK or
    // a checkout's node_modules at runtime.
    noExternal: true,
  },
});
