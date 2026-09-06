import { fileURLToPath } from 'node:url';

import {
  parseClientCacheArguments,
  runLockedClientCacheCommand,
} from './deployment/client-cache-command.ts';

// The supported image/Node command always holds a real kernel lock across the
// whole operation. A separate worker inherits that lock, so no PID files,
// stale-lock cleanup or unlocked fallback can admit a second writer.
try {
  await runLockedClientCacheCommand(
    parseClientCacheArguments(process.argv.slice(2)),
    fileURLToPath(new URL('./client-cache-operation.js', import.meta.url)),
  );
} catch {
  process.stderr.write(
    'Client asset command refused. Use client-assets <retain|verify|archive> --directory /absolute/cache.\n',
  );
  process.exitCode = 2;
}
