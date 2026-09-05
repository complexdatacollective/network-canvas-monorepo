import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

export type SmtpBehavior =
  | 'accept'
  | 'reject_recipient_temporary'
  | 'reject_recipient_permanent'
  | 'reject_data_temporary'
  | 'reject_data_permanent'
  | 'disconnect_data'
  | 'silent_greeting'
  | 'silent_data';

/** A local protocol peer, independent of Nodemailer's implementation. */
export async function smtpFixture(behavior: SmtpBehavior = 'accept') {
  const sockets = new Set<Socket>();
  const messages: string[] = [];
  const commands: string[] = [];
  let connected: () => void = () => undefined;
  let received: () => void = () => undefined;
  const connection = new Promise<void>((resolve) => {
    connected = resolve;
  });
  const dataReceived = new Promise<void>((resolve) => {
    received = resolve;
  });
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    let pending = '';
    let inData = false;
    socket.on('data', (chunk: string) => {
      pending += chunk;
      for (;;) {
        if (inData) {
          const end = pending.indexOf('\r\n.\r\n');
          if (end === -1) return;
          messages.push(pending.slice(0, end));
          pending = pending.slice(end + 5);
          inData = false;
          received();
          if (behavior === 'disconnect_data') {
            socket.destroy();
            return;
          }
          if (behavior === 'silent_data') return;
          socket.write(
            behavior === 'reject_data_temporary'
              ? '450 private-recipient@example.test data rejected secret://canary\r\n'
              : behavior === 'reject_data_permanent'
                ? '550 private-recipient@example.test data rejected secret://canary\r\n'
                : '250 Accepted\r\n',
          );
          continue;
        }
        const end = pending.indexOf('\r\n');
        if (end === -1) return;
        const command = pending.slice(0, end);
        pending = pending.slice(end + 2);
        commands.push(command);
        if (command.startsWith('EHLO') || command.startsWith('HELO'))
          socket.write('250-local-smtp.test\r\n250 AUTH PLAIN\r\n');
        else if (command.startsWith('AUTH'))
          socket.write('235 Authenticated\r\n');
        else if (command.startsWith('MAIL FROM'))
          socket.write('250 Sender accepted\r\n');
        else if (command.startsWith('RCPT TO'))
          socket.write(
            behavior === 'reject_recipient_temporary'
              ? '450 private-recipient@example.test temporary secret://canary\r\n'
              : behavior === 'reject_recipient_permanent'
                ? '550 private-recipient@example.test permanent secret://canary\r\n'
                : '250 Recipient accepted\r\n',
          );
        else if (command === 'DATA') {
          inData = true;
          socket.write('354 Send message\r\n');
        } else if (command === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('500 Unknown command\r\n');
      }
    });
    if (behavior !== 'silent_greeting')
      socket.write('220 local-smtp.test Ready\r\n');
    connected();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address();
  if (!bound || typeof bound === 'string')
    throw new Error('SMTP_TEST_ADDRESS_MISSING');
  return {
    url: `smtp://127.0.0.1:${bound.port}`,
    messages,
    commands,
    connection,
    dataReceived,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
