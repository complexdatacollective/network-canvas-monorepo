import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import JSZip from 'jszip';
import { build } from 'vite';

async function filesBelow(root, directory = root) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesBelow(root, path)));
    else if (entry.isFile()) found.push([relative(root, path), path]);
    else throw new Error('ANCHOR_BUILD_FAILED');
  }
  return found.toSorted(([left], [right]) => left.localeCompare(right));
}

export async function buildManagedAnchorArtifact(outputDirectory) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0)
    throw new Error('ANCHOR_BUILD_FAILED');
  const runtime = join(outputDirectory, 'runtime');
  const artifact = join(outputDirectory, 'studio-observability-anchor.zip');
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await build({
    configFile: new URL(
      './observability-anchor.vite.config.mjs',
      import.meta.url,
    ).pathname,
    build: { outDir: runtime },
  });
  const archive = new JSZip();
  for (const [name, path] of await filesBelow(runtime))
    archive.file(name, await readFile(path), {
      createFolders: false,
      date: new Date(0),
      unixPermissions: 0o100644,
    });
  await writeFile(
    artifact,
    await archive.generateAsync({
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      platform: 'UNIX',
      type: 'nodebuffer',
    }),
    { mode: 0o600 },
  );
  return { artifact, runtime };
}

if (import.meta.main) {
  try {
    const output = new URL('./dist-anchor', import.meta.url).pathname;
    const result = await buildManagedAnchorArtifact(output);
    process.stdout.write(`${result.artifact}\n`);
  } catch {
    process.stderr.write('ANCHOR_BUILD_FAILED\n');
    process.exitCode = 1;
  }
}
