import {
  createServer,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

const routing = vi.hoisted(() => ({ url: '', requested: '' }));
vi.mock('node:https', async () => {
  const http = await import('node:http');
  return {
    request: vi.fn(
      (
        url: string,
        options: RequestOptions,
        callback: (response: IncomingMessage) => void,
      ) => {
        routing.requested = url;
        const outgoing = http.request(routing.url, options, callback);
        outgoing.once('socket', (socket) =>
          socket.once('connect', () => socket.emit('secureConnect')),
        );
        return outgoing;
      },
    ),
  };
});

import { createTwilioSmsSender, SmsDeliveryError } from '../sms-sender.ts';

describe('Twilio SMS sender', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    routing.url = '';
    routing.requested = '';
  });

  it('submits one bounded form with a delivery-specific callback and retains the provider receipt', async () => {
    const received = Promise.withResolvers<{
      headers: IncomingMessage['headers'];
      body: string;
    }>();
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.resolve({
          headers: request.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(201, { 'content-type': 'application/json' });
        response.end('{"sid":"SM00000000000000000000000000000000"}');
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    routing.url = `http://127.0.0.1:${address.port}/`;
    close = () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const sender = createTwilioSmsSender({
      accountSid: `AC${'1'.repeat(32)}`,
      authToken: 'private-token',
      from: '+13125550100',
      callbackBaseUrl: 'https://studio.example',
    });
    await expect(
      sender.send({
        to: '+13125550101',
        body: 'Private message',
        deliveryId: '00000000-0000-4000-8000-000000000009',
      }),
    ).resolves.toEqual({
      status: 'accepted',
      providerMessageId: `SM${'0'.repeat(32)}`,
    });
    const request = await received.promise;
    expect(routing.requested).toContain(
      `/Accounts/AC${'1'.repeat(32)}/Messages.json`,
    );
    expect(request.headers.authorization).toBe(
      `Basic ${Buffer.from(`AC${'1'.repeat(32)}:private-token`).toString('base64')}`,
    );
    expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
      To: '+13125550101',
      From: '+13125550100',
      Body: 'Private message',
      StatusCallback:
        'https://studio.example/api/v1/message-status/twilio/00000000-0000-4000-8000-000000000009',
    });
    sender.close();
  });

  it('refuses malformed input before opening a request', async () => {
    const sender = createTwilioSmsSender({
      accountSid: `AC${'1'.repeat(32)}`,
      authToken: 'private-token',
      from: '+13125550100',
      callbackBaseUrl: 'https://studio.example',
    });
    await expect(
      sender.send({
        to: 'not-a-number',
        body: 'Body',
        deliveryId: '00000000-0000-4000-8000-000000000009',
      }),
    ).rejects.toBeInstanceOf(SmsDeliveryError);
    expect(routing.requested).toBe('');
  });
});
