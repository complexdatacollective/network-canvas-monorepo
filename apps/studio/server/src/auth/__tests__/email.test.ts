import { afterEach, expect, it } from 'vitest';

import { smtpFixture } from '../../../../../../packages/studio-sync/src/__tests__/smtp-fixture.ts';
import { createMailer } from '../email.ts';

const peers: Awaited<ReturnType<typeof smtpFixture>>[] = [];
afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.close();
});

it.each([
  'invalid',
  'first@example.test, second@example.test',
  'Studio <bad>',
  'Name\r\nInjected: yes <from@example.test>',
])('refuses invalid configured sender %s before accepting work', (from) => {
  expect(() =>
    createMailer({ kind: 'smtp', url: 'smtp://127.0.0.1:1', from }),
  ).toThrow('EMAIL_DELIVERY_PERMANENT');
  expect(() =>
    createMailer({
      kind: 'postmark',
      serverToken: 'fixture-server-token',
      messageStream: 'outbound',
      from,
    }),
  ).toThrow('EMAIL_DELIVERY_PERMANENT');
});

it('delivers an existing team snapshot containing line breaks as one safe subject', async () => {
  const peer = await smtpFixture();
  peers.push(peer);
  const mailer = createMailer({
    kind: 'smtp',
    url: peer.url,
    from: 'Studio <from@example.test>',
  });
  await mailer.sendTeamInvitation({
    email: 'recipient@example.test',
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    invitationUrl: 'https://studio.example.test/invite/fixture',
    inviterLabel: 'Researcher',
    messageId: '<safe-subject@example.test>',
    role: 'member',
    teamLabel: 'First\r\nSecond\rThird\nFourth',
  });
  expect(peer.messages).toHaveLength(1);
  expect(peer.messages[0]).toContain(
    'Subject: Invitation to join First Second Third Fourth in Network Canvas',
  );
  expect(
    peer.commands.filter((command) => command.startsWith('RCPT TO:')),
  ).toEqual(['RCPT TO:<recipient@example.test>']);
});

it.each(['A'.repeat(240), '\\'.repeat(120)])(
  'refuses an oversized formatted Postmark sender at construction',
  (name) => {
    const from = `"${name.replace(/["\\]/g, '\\$&')}" <from@example.test>`;
    expect(from.length).toBeGreaterThan(255);
    // Both are syntactically valid senders; only the Postmark wire bound fails.
    const smtp = createMailer({
      kind: 'smtp',
      url: 'smtp://127.0.0.1:1',
      from,
    });
    smtp.close();
    expect(() =>
      createMailer({
        kind: 'postmark',
        serverToken: 'fixture-server-token',
        messageStream: 'outbound',
        from,
      }),
    ).toThrow('EMAIL_DELIVERY_PERMANENT');
  },
);

it('accepts an exactly255-character formatted Postmark sender at construction', () => {
  const from = `"${'A'.repeat(233)}" <from@example.test>`;
  expect(from.length).toBe(255);
  const mailer = createMailer({
    kind: 'postmark',
    serverToken: 'fixture-server-token',
    messageStream: 'outbound',
    from,
  });
  mailer.close();
});
