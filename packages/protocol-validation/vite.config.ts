/// <reference types="vitest" />

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const relativeDeclarationSpecifier =
  /\b(from\s+['"]|import\s+['"])(\.[^'"]+)(['"])/g;
const relativeDynamicDeclarationSpecifier =
  /\b(import\(\s*['"])(\.[^'"]+)(['"]\s*\))/g;
const runtimeDeclarationExtension = /\.(?:cjs|css|js|json|mjs)$/;
const distSrcRoot = resolve(__dirname, 'dist/src');
const srcRoot = resolve(__dirname, 'src');

const isDirectory = (targetPath: string) =>
  existsSync(targetPath) && statSync(targetPath).isDirectory();

const hasDirectoryIndex = (targetPath: string) =>
  isDirectory(targetPath) &&
  ['index.d.ts', 'index.ts', 'index.tsx'].some((fileName) =>
    existsSync(resolve(targetPath, fileName)),
  );

const declarationTargetPath = (filePath: string, specifier: string) => {
  const declarationPath = resolve(dirname(filePath), specifier);
  const sourcePath = declarationPath.startsWith(distSrcRoot)
    ? declarationPath.replace(distSrcRoot, srcRoot)
    : declarationPath;

  return hasDirectoryIndex(declarationPath) || hasDirectoryIndex(sourcePath)
    ? `${specifier}/index.js`
    : `${specifier}.js`;
};

const appendJsExtension = (filePath: string, specifier: string) =>
  runtimeDeclarationExtension.test(specifier)
    ? specifier
    : declarationTargetPath(filePath, specifier);

const addJsExtensionsToDeclarationSpecifiers = (
  filePath: string,
  content: string,
) =>
  content
    .replace(
      relativeDeclarationSpecifier,
      (_match, prefix: string, specifier: string, suffix: string) =>
        `${prefix}${appendJsExtension(filePath, specifier)}${suffix}`,
    )
    .replace(
      relativeDynamicDeclarationSpecifier,
      (_match, prefix: string, specifier: string, suffix: string) =>
        `${prefix}${appendJsExtension(filePath, specifier)}${suffix}`,
    );

const schemaPlugin = (): Plugin => {
  return {
    name: 'schema',

    // watches the schema files for changes
    buildStart() {
      this.addWatchFile(path.resolve('src/schemas/'));
    },
    // runs when a file changes
    watchChange(file) {
      if (file.endsWith('zod.ts')) {
        execSync('pnpm run zod-to-json src/schemas/8.zod.ts');
      }

      if (file.endsWith('.json')) {
        execSync('pnpm run compile-schemas');
      }
    },
  };
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ProtocolValidation',
      // the proper extensions will be added
      fileName: 'index',
      formats: ['es'],
    },
  },
  plugins: [
    schemaPlugin(),
    dts({
      insertTypesEntry: true,
      beforeWriteFile: (filePath, content) => ({
        content: addJsExtensionsToDeclarationSpecifiers(filePath, content),
      }),
    }),
  ],
});
