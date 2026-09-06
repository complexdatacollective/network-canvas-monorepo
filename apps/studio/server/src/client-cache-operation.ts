import { fileURLToPath } from 'node:url';

import {
  retainClientAssets,
  verifyClientAssetCache,
} from './deployment/client-asset-cache.ts';
import {
  parseClientCacheArguments,
  runClientCacheChild,
} from './deployment/client-cache-command.ts';

// Internal worker of client-cache.js, executed by flock --no-fork. Only the
// selected image supplies new bytes: no source-path argument or environment
// variable can substitute unreviewed application code.
try {
  const { action, directory } = parseClientCacheArguments(
    process.argv.slice(2),
  );
  const source = fileURLToPath(new URL('../client/assets', import.meta.url));
  const verified =
    action === 'retain'
      ? await retainClientAssets(source, directory)
      : await verifyClientAssetCache(directory, source);
  if (action === 'archive') {
    // Binary stdout only. Complete generation validation excludes untracked
    // files; immutable generation paths cannot race a pointer replacement.
    await runClientCacheChild('/bin/tar', [
      '--format=posix',
      '-C',
      directory,
      '-cf',
      '-',
      'current',
      verified.generation,
    ]);
  } else {
    process.stdout.write(
      `${JSON.stringify({ generation: verified.generation, files: verified.files })}\n`,
    );
  }
} catch {
  process.stderr.write('Client asset operation refused.\n');
  process.exitCode = 2;
}
