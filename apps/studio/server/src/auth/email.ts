import nodemailer from 'nodemailer';

import type { TeamRole } from '@codaco/studio-rpc';

import type { MailerEnv } from '../env.ts';

export type MagicLinkMailer = {
  sendMagicLink(input: { email: string; url: string }): Promise<void>;
};

export type InvitationMailer = {
  sendTeamInvitation(input: {
    email: string;
    expiresAt: Date;
    invitationUrl: string;
    inviterLabel: string;
    messageId: string;
    role: TeamRole;
    teamLabel: string;
  }): Promise<void>;
};

export type StudioMailer = MagicLinkMailer & InvitationMailer;

export function createConsoleMailer(): StudioMailer {
  return {
    sendMagicLink: ({ email, url }) => {
      // oxlint-disable-next-line no-console -- the development sign-in loop
      console.log(`Magic link for ${email}: ${url}`);
      return Promise.resolve();
    },
    sendTeamInvitation: ({ email, invitationUrl, teamLabel }) => {
      // oxlint-disable-next-line no-console -- the development invitation loop
      console.log(`Invitation to ${teamLabel} for ${email}: ${invitationUrl}`);
      return Promise.resolve();
    },
  };
}

function createSmtpMailer(smtpUrl: string, from: string): StudioMailer {
  // Magic-link sends happen inside the sign-in request, and nodemailer's
  // defaults (2 minutes to connect, 10 minutes of socket inactivity) would
  // hold that request open long past the point the person gave up. These
  // bounds also keep an invitation attempt within its worker's 60-second
  // lease under ordinary transport failures.
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
    sendTeamInvitation: async ({
      email,
      expiresAt,
      invitationUrl,
      inviterLabel,
      messageId,
      role,
      teamLabel,
    }) => {
      await transport.sendMail({
        from,
        to: email,
        messageId,
        subject: `Invitation to join ${teamLabel} in Network Canvas Studio`,
        text: [
          `${inviterLabel} invited you to join ${teamLabel} in Network Canvas Studio.`,
          '',
          `Your team role will be ${role}.`,
          '',
          'Review and accept the invitation:',
          invitationUrl,
          '',
          `The invitation expires ${expiresAt.toUTCString()}.`,
          'If you were not expecting this invitation, you can ignore this email.',
        ].join('\n'),
      });
    },
  };
}

function createRefusingMailer(): StudioMailer {
  return {
    sendMagicLink: () =>
      Promise.reject(
        new Error('No SMTP transport is configured; cannot send sign-in email'),
      ),
    sendTeamInvitation: () =>
      Promise.reject(
        new Error('No SMTP transport is configured; cannot send invitation'),
      ),
  };
}

export function createMailer(mailer: MailerEnv): StudioMailer {
  switch (mailer.kind) {
    case 'smtp':
      return createSmtpMailer(mailer.url, mailer.from);
    case 'console':
      return createConsoleMailer();
    case 'refuse':
      return createRefusingMailer();
  }
  throw new Error('Unsupported mailer configuration');
}
