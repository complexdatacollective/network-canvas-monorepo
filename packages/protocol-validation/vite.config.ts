/// <reference types="vitest" />

import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const relativeDeclarationSpecifier =
  /\b(from\s+['"]|import\s+['"])(\.[^'"]+)(['"])/g;
const relativeDynamicDeclarationSpecifier =
  /\b(import\(\s*['"])(\.[^'"]+)(['"]\s*\))/g;
const runtimeDeclarationExtension = /\.(?:cjs|css|js|json|mjs)$/;
const sourceDeclarationExtension = /\.tsx?$/;
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

const appendJsExtension = (filePath: string, specifier: string) => {
  // Source now uses explicit '.ts'/'.tsx' specifiers (so Node's native ESM
  // loader can resolve them); the published d.ts must still point at the
  // '.js' files that ship in dist, so rewrite the extension rather than
  // appending a second one.
  if (runtimeDeclarationExtension.test(specifier)) {
    return specifier;
  }

  if (sourceDeclarationExtension.test(specifier)) {
    return specifier.replace(sourceDeclarationExtension, '.js');
  }

  // Fallback for any (unexpected) extensionless specifier.
  return declarationTargetPath(filePath, specifier);
};

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

export default defineConfig({
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
    dts({
      insertTypesEntry: true,
      beforeWriteFile: (filePath, content) => ({
        content: addJsExtensionsToDeclarationSpecifiers(filePath, content),
      }),
    }),
  ],
});
