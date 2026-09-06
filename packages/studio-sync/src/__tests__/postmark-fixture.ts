import { createServer } from 'node:http';
import type { Socket } from 'node:net';

export type PostmarkReply = {
  status?: number;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  headers?: Record<string, string>;
  behavior?:
    | 'disconnect'
    | 'silent'
    | 'stall-body'
    | 'partial'
    | 'oversized'
    | 'redirect';
};

/** Synthetic receiver only. Tests reroute node:https.request at the import boundary. */
export async function postmarkFixture(reply: PostmarkReply = {}) {
  const sockets = new Set<Socket>();
  const messages: {
    method: string | undefined;
    url: string | undefined;
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, unknown>;
  }[] = [];
  const waiting: { count: number; resolve: () => void }[] = [];
  const disconnected = Promise.withResolvers<void>();
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
      if (body === null || typeof body !== 'object' || !('To' in body)) {
        throw new Error('Fixture received an invalid email request');
      }
      messages.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: body as Record<string, unknown>,
      });
      for (const entry of waiting) {
        if (messages.length >= entry.count) entry.resolve();
      }
      if (reply.behavior === 'silent') return;
      if (reply.behavior === 'disconnect') {
        response.destroy();
        return;
      }
      if (reply.behavior === 'redirect') {
        response.writeHead(307, { Location: '/credential-trap' }).end();
        return;
      }
      response.writeHead(reply.status ?? 200, {
        'Content-Type': reply.contentType ?? 'application/json; charset=utf-8',
        ...reply.headers,
      });
      if (reply.behavior === 'stall-body') {
        response.flushHeaders();
        return;
      }
      if (reply.behavior === 'partial') {
        response.write('{"ErrorCode":0,');
        response.destroy();
        return;
      }
      if (reply.behavior === 'oversized') {
        response.write('x'.repeat(16 * 1024 + 1));
        return;
      }
      response.end(
        reply.rawBody ??
          JSON.stringify(
            reply.body ?? {
              ErrorCode: 0,
              MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
              To: body.To,
              SubmittedAt: '2026-09-06T12:00:00.1234567+00:00',
              Message: 'OK',
            },
          ),
      );
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) disconnected.resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No fixture port');
  return {
    url: `http://127.0.0.1:${address.port}/email`,
    messages,
    received(count = 1) {
      if (messages.length >= count) return Promise.resolve();
      return new Promise<void>((resolve) => waiting.push({ count, resolve }));
    },
    disconnected: disconnected.promise,
    disconnect() {
      for (const socket of sockets) socket.destroy();
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
