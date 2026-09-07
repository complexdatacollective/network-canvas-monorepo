import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createAccountAssetsFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'registry-account-assets-'));
  await mkdir(join(directory, '.vite'));
  await mkdir(join(directory, 'assets'));
  await writeFile(
    join(directory, '.vite/manifest.json'),
    JSON.stringify({
      'index.html': {
        file: 'assets/account-abcdef.js',
        isEntry: true,
        css: ['assets/account-abcdef.css'],
      },
    }),
  );
  await writeFile(
    join(directory, 'index.html'),
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/account/assets/account-abcdef.js"></script></body></html>',
  );
  await writeFile(
    join(directory, 'assets/account-abcdef.js'),
    'document.getElementById("root").textContent = "account fixture";',
  );
  await writeFile(
    join(directory, 'assets/account-abcdef.css'),
    'body { font-family: sans-serif; }',
  );
  return {
    directory,
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
