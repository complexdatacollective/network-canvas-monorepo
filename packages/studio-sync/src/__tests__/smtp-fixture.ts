import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

export type SmtpBehavior =
  | 'accept'
  | 'reject_recipient_temporary'
  | 'reject_recipient_permanent'
  | 'reject_data_temporary'
  | 'reject_data_permanent'
  | 'disconnect_data'
  | 'silent_auth'
  | 'silent_mail'
  | 'silent_rcpt'
  | 'silent_data_command'
  | 'disconnect_tls'
  | 'silent_greeting'
  | 'silent_data';

/** A local protocol peer, independent of Nodemailer's implementation. */
export async function smtpFixture(behavior: SmtpBehavior = 'accept') {
  const sockets = new Set<Socket>();
  const messages: string[] = [];
  const commands: string[] = [];
  let connected: () => void = () => undefined;
  let received: () => void = () => undefined;
  let commandReached: () => void = () => undefined;
  const commandReceived = new Promise<void>((resolve) => {
    commandReached = resolve;
  });
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
    let startingTls = false;
    socket.on('data', (chunk: string) => {
      if (startingTls) {
        // The actual TLS ClientHello proves the peer entered negotiation.
        commandReached();
        socket.destroy();
        return;
      }
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
        if (
          (behavior === 'silent_auth' && command.startsWith('AUTH')) ||
          (behavior === 'silent_mail' && command.startsWith('MAIL FROM')) ||
          (behavior === 'silent_rcpt' && command.startsWith('RCPT TO')) ||
          (behavior === 'silent_data_command' && command === 'DATA')
        ) {
          commandReached();
          continue;
        }
        if (behavior === 'disconnect_tls') {
          if (command.startsWith('EHLO'))
            socket.write('250-local-smtp.test\r\n250 STARTTLS\r\n');
          else if (command === 'STARTTLS') {
            startingTls = true;
            socket.write('220 Begin TLS\r\n');
          }
          continue;
        }
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
    commandReceived,
    acceptPending() {
      if (behavior !== 'silent_data' || messages.length !== 1)
        throw new Error('No held message');
      for (const socket of sockets) socket.write('250 Accepted\r\n');
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
