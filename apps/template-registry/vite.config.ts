import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    rolldownOptions: {
      input: {
        index: 'src/index.ts',
        migrate: 'src/migrate.ts',
        operator: 'src/operator.ts',
        backup: 'src/backup.ts',
        configure: 'src/configure.ts',
        recover: 'src/recover.ts',
      },
      output: { entryFileNames: '[name].js' },
    },
  },
  // Native Node does not type-strip workspace TypeScript in node_modules.
  ssr: {
    // protocol-validation's published build bundles JSZip, but its source-first
    // consumer must do that here: JSZip is absent from pnpm deploy --prod.
    noExternal: [/^@codaco\//, 'jszip'],
  },
});
