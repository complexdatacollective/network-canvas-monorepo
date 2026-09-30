import { createServer, type Server, type Socket } from 'node:net';

// A transport that accepts the connection and then says nothing at all, which
// is how a send is held open on purpose: nodemailer waits for a greeting that
// never comes and gives up on its own timeout. Two suites need that — one to
// prove the timeout is the one src/mail/smtp.ts asks for, and one to have a
// job still in flight when the worker is signalled to stop.
//
// Silence rather than a closed port: a refused connection fails in
// milliseconds, which would prove nothing about either.

export type SilentSmtp = {
  port: number;
  close: () => Promise<void>;
};

export async function startSilentSmtp(): Promise<SilentSmtp> {
  const connections: Socket[] = [];
  const server: Server = createServer((socket) => {
    connections.push(socket);
  });
  const port = await new Promise<number>((listening) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      listening(typeof address === 'object' && address ? address.port : 0);
    });
  });

  return {
    port,
    // The sockets are destroyed first: `close()` stops the server accepting
    // but waits out whatever is still connected, and a send that was left
    // hanging would hold the suite open for the rest of its timeout.
    close: async () => {
      for (const socket of connections) socket.destroy();
      await new Promise<void>((closed) => server.close(() => closed()));
    },
  };
}
