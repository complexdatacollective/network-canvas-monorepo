import nodemailer from 'nodemailer';

import type { MailerEnv } from '../env.ts';

// Magic-link delivery behind an interface: SMTP is the one production
// transport (#1250 — any provider's SMTP endpoint works, no vendor SDK), the
// console mailer is the development loop, and the refusing mailer makes a
// production deployment without SMTP fail loudly at send time instead of
// silently dropping sign-in mail. Tests inject a capturing implementation.

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
  const transport = nodemailer.createTransport(smtpUrl);
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
