import nodemailer from 'nodemailer';

import type { MailerEnv } from '../env.ts';

export type MagicLinkMailer = {
  sendMagicLink(input: { email: string; url: string }): Promise<void>;
};

export function createConsoleMailer(): MagicLinkMailer {
  return {
    sendMagicLink: ({ email, url }) => {
      // oxlint-disable-next-line no-console -- the development sign-in loop
      console.log(`Magic link for ${email}: ${url}`);
      return Promise.resolve();
    },
  };
}

function createSmtpMailer(smtpUrl: string, from: string): MagicLinkMailer {
  // The send happens inside the sign-in request, and nodemailer's defaults
  // (2 minutes to connect, 10 minutes of socket inactivity) would hold that
  // request open long past the point the person gave up.
  const transport = nodemailer.createTransport({
    url: smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    sendMagicLink: async ({ email, url }) => {
      await transport.sendMail({
        from,
        to: email,
        subject: 'Sign in to Network Canvas Studio',
        text: [
          'Use this link to sign in to Network Canvas Studio:',
          '',
          url,
          '',
          'The link expires in 5 minutes and can be used once.',
          'If you did not request it, you can ignore this email.',
        ].join('\n'),
      });
    },
  };
}

function createRefusingMailer(): MagicLinkMailer {
  return {
    sendMagicLink: () =>
      Promise.reject(
        new Error('No SMTP transport is configured; cannot send sign-in email'),
      ),
  };
}

export function createMailer(mailer: MailerEnv): MagicLinkMailer {
  switch (mailer.kind) {
    case 'smtp':
      return createSmtpMailer(mailer.url, mailer.from);
    case 'console':
      return createConsoleMailer();
    case 'refuse':
      return createRefusingMailer();
  }
}
