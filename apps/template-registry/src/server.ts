import { once } from 'node:events';
import { createServer } from 'node:http';

import { getRequestListener } from '@hono/node-server';

import type { RegistryRuntime } from './runtime.ts';

/** Actual Node socket bounds also apply when a request never enters Hono. */
export async function listenRegistry(
  runtime: RegistryRuntime,
  port: number,
  hostname = '0.0.0.0',
) {
  const server = createServer(
    { requestTimeout: 20_000, headersTimeout: 10_000, keepAliveTimeout: 5000 },
    getRequestListener(runtime.app.fetch, { overrideGlobalObjects: false }),
  );
  server.maxConnections = 128;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(60_000, (socket) => socket.destroy());
  // Do not let Node's default client parser diagnostics disclose submitted data.
  server.on('clientError', (_error, socket) => socket.destroy());
  server.listen(port, hostname);
  try {
    await once(server, 'listening');
  } catch {
    await runtime.close();
    throw new Error('REGISTRY_STARTUP_FAILED');
  }
  let closing: Promise<void> | undefined;
  return {
    server,
    close() {
      closing ??= (async () => {
        runtime.stopAdmission();
        const closed = new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error ? reject(new Error('REGISTRY_SHUTDOWN_FAILED')) : resolve(),
          );
        });
        // Existing requests get ten seconds to drain before their sockets close.
        const force = setTimeout(() => server.closeAllConnections(), 10_000);
        force.unref();
        try {
          await closed;
          await runtime.close();
        } finally {
          clearTimeout(force);
        }
      })();
      return closing;
    },
  };
}
