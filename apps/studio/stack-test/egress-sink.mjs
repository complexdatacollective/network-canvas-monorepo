import dgram from 'node:dgram';
import { writeFileSync } from 'node:fs';
import net from 'node:net';

const address = process.env.EGRESS_SINK_ADDRESS;
if (!address || !/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
  console.error(
    'EGRESS_SINK_ADDRESS must be the IPv4 address this sink answers with',
  );
  process.exit(1);
}
const answer = Buffer.from(address.split('.').map(Number));

const record = (entry) => {
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
  );
};

const readQuestion = (message) => {
  if (message.length < 12 || message.readUInt16BE(4) < 1) return undefined;
  const labels = [];
  let offset = 12;
  while (offset < message.length && message[offset] !== 0) {
    const length = message[offset];
    if (length > 63 || offset + 1 + length > message.length) return undefined;
    labels.push(
      message.subarray(offset + 1, offset + 1 + length).toString('latin1'),
    );
    offset += length + 1;
  }
  if (offset + 5 > message.length) return undefined;
  return {
    name: labels.join('.').toLowerCase(),
    type: message.readUInt16BE(offset + 1),
    end: offset + 5,
  };
};

const respond = (message, question) => {
  const header = Buffer.from(message.subarray(0, 12));
  const recursionDesired = header[2] & 0x01;
  header[2] = 0x84 | recursionDesired;
  header[3] = 0x80;
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(question.type === 1 ? 1 : 0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  const parts = [header, message.subarray(12, question.end)];
  if (question.type === 1) {
    parts.push(
      Buffer.from([
        0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x04,
      ]),
      answer,
    );
  }
  return Buffer.concat(parts);
};

const dns = dgram.createSocket('udp4');
dns.on('message', (message, remote) => {
  const question = readQuestion(message);
  if (!question) return;
  record({ kind: 'dns', name: question.name, type: question.type });
  dns.send(respond(message, question), remote.port, remote.address);
});

const serverName = (hello) => {
  if (hello.length < 5 || hello[0] !== 0x16) return undefined;
  let offset = 5;
  if (hello[offset] !== 0x01) return undefined;
  offset += 4 + 2 + 32;
  if (offset >= hello.length) return undefined;
  offset += 1 + hello[offset];
  if (offset + 2 > hello.length) return undefined;
  offset += 2 + hello.readUInt16BE(offset);
  if (offset + 1 > hello.length) return undefined;
  offset += 1 + hello[offset];
  if (offset + 2 > hello.length) return undefined;
  const extensionsEnd = Math.min(
    hello.length,
    offset + 2 + hello.readUInt16BE(offset),
  );
  offset += 2;
  while (offset + 4 <= extensionsEnd) {
    const type = hello.readUInt16BE(offset);
    const length = hello.readUInt16BE(offset + 2);
    const body = offset + 4;
    if (type === 0 && body + 5 <= extensionsEnd) {
      const nameLength = hello.readUInt16BE(body + 3);
      return hello
        .subarray(body + 5, body + 5 + nameLength)
        .toString('latin1')
        .toLowerCase();
    }
    offset = body + length;
  }
  return undefined;
};

const listen = (port, onConnection) =>
  new Promise((resolve, reject) => {
    const server = net.createServer(onConnection);
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
  });

const collect = (socket, done, limit = 16384) => {
  let buffered = Buffer.alloc(0);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done(buffered);
  };
  socket.setTimeout(5000, () => {
    finish();
    socket.destroy();
  });
  socket.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    if (done.ready(buffered) || buffered.length >= limit) finish();
  });
  socket.on('end', finish);
  socket.on('error', () => {});
};

const tls = (port) =>
  listen(port, (socket) => {
    const done = (hello) => {
      record({ kind: 'tls', port, sni: serverName(hello) ?? null });
      socket.destroy();
    };
    done.ready = (buffered) =>
      buffered.length >= 5 && buffered.length >= 5 + buffered.readUInt16BE(3);
    collect(socket, done);
  });

const http = (port) =>
  listen(port, (socket) => {
    const done = (head) => {
      const host =
        /^host:\s*([^\r\n:]+)/im
          .exec(head.toString('latin1'))?.[1]
          ?.toLowerCase() ?? null;
      record({ kind: 'http', port, host });
      socket.end(
        'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
      );
    };
    done.ready = (buffered) => buffered.includes('\r\n\r\n');
    collect(socket, done);
  });

const smtp = (port) =>
  listen(port, (socket) => {
    let pending = '';
    let inData = false;
    let recipients = 0;
    socket.on('error', () => {});
    socket.setEncoding('latin1');
    socket.write('220 egress-sink ESMTP\r\n');
    socket.on('data', (chunk) => {
      pending += chunk;
      for (;;) {
        if (inData) {
          const end = pending.indexOf('\r\n.\r\n');
          if (end < 0) return;
          pending = pending.slice(end + 5);
          inData = false;
          record({ kind: 'smtp', port, recipients });
          recipients = 0;
          socket.write('250 2.0.0 accepted\r\n');
          continue;
        }
        const end = pending.indexOf('\r\n');
        if (end < 0) return;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO')
          socket.write('250 egress-sink\r\n');
        else if (verb === 'RCPT') {
          recipients += 1;
          socket.write('250 2.1.5 ok\r\n');
        } else if (verb === 'DATA') {
          inData = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (verb === 'QUIT') {
          socket.end('221 2.0.0 bye\r\n');
          return;
        } else socket.write('250 2.0.0 ok\r\n');
      }
    });
  });

await Promise.all([
  new Promise((resolve, reject) => {
    dns.once('error', reject);
    dns.bind(53, '0.0.0.0', resolve);
  }),
  tls(443),
  http(80),
  smtp(25),
]);
record({ kind: 'ready' });
writeFileSync('/tmp/egress-sink-listening', '');
