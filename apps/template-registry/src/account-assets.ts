import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

// Studio's client mount owns its topology gates and SPA fallback. This service
// serves one account document and a closed, immutable Vite asset inventory.
const assetName = z
  .string()
  .regex(/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(js|css|woff2|svg|png|webp)$/);
const item = z.object({
  file: assetName,
  isEntry: z.boolean().optional(),
  css: z.array(assetName).optional(),
  assets: z.array(assetName).optional(),
  imports: z.array(z.string()).optional(),
  dynamicImports: z.array(z.string()).optional(),
});
const manifestSchema = z.record(z.string(), item);
const MIME = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  woff2: 'font/woff2',
  svg: 'image/svg+xml',
  png: 'image/png',
  webp: 'image/webp',
} as const;

type Asset = Readonly<{
  bytes: Uint8Array;
  contentType: string;
  etag: string;
  document: boolean;
}>;
export type RegistryAccountAssets = {
  get: (
    pathname: string,
  ) =>
    | (Omit<Asset, 'bytes'> & { byteLength: number; body: () => Uint8Array })
    | undefined;
};

/** Load and verify the complete small page before runtime admission. Requests
 * never read arbitrary filesystem paths, and cannot alter the cached bytes. */
export async function loadRegistryAccountAssets(
  directory = fileURLToPath(new URL('../dist/account/', import.meta.url)),
): Promise<RegistryAccountAssets> {
  try {
    const root = await realpath(directory);
    let totalBytes = 0;
    const read = async (name: string, limit: number) => {
      const target = join(root, name);
      const stat = await lstat(target);
      if (
        !stat.isFile() ||
        stat.size > limit ||
        !(await realpath(target)).startsWith(`${root}${sep}`)
      )
        throw new Error();
      const bytes = await readFile(target);
      totalBytes += bytes.byteLength;
      if (bytes.byteLength !== stat.size || totalBytes > 16 * 1024 * 1024)
        throw new Error();
      return bytes;
    };
    const manifest = manifestSchema.parse(
      JSON.parse(
        (await read('.vite/manifest.json', 128 * 1024)).toString('utf8'),
      ),
    );
    const entry = manifest['index.html'];
    if (!entry?.isEntry || !entry.file.endsWith('.js')) throw new Error();
    const files = new Set<string>();
    for (const value of Object.values(manifest)) {
      for (const imported of [
        ...(value.imports ?? []),
        ...(value.dynamicImports ?? []),
      ])
        if (!manifest[imported]) throw new Error();
      for (const file of [
        value.file,
        ...(value.css ?? []),
        ...(value.assets ?? []),
      ])
        files.add(file);
    }
    if (files.size > 128) throw new Error();
    const html = await read('index.html', 64 * 1024);
    if (!html.toString('utf8').includes(`/account/${entry.file}`))
      throw new Error();
    const assets = new Map<string, Asset>();
    const add = (
      path: string,
      bytes: Uint8Array,
      contentType: string,
      document: boolean,
    ) =>
      assets.set(path, {
        bytes,
        contentType,
        document,
        etag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
      });
    add('/account', html, 'text/html; charset=utf-8', true);
    add('/account/', html, 'text/html; charset=utf-8', true);
    for (const name of files) {
      const extension = name.slice(name.lastIndexOf('.') + 1);
      if (!(extension in MIME)) throw new Error();
      add(
        `/account/${name}`,
        await read(name, 8 * 1024 * 1024),
        MIME[extension as keyof typeof MIME],
        false,
      );
    }
    return {
      get: (pathname) => {
        const found = assets.get(pathname);
        return found
          ? {
              contentType: found.contentType,
              etag: found.etag,
              document: found.document,
              byteLength: found.bytes.byteLength,
              body: () => Uint8Array.from(found.bytes),
            }
          : undefined;
      },
    };
  } catch {
    throw new Error('REGISTRY_ACCOUNT_ASSETS_INVALID');
  }
}
