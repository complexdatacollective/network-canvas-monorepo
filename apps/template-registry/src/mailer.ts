import type pg from 'pg';

import {
  createSmtpEmailSender,
  validateEmailAddress,
} from '@codaco/studio-sync/email-sender';
import {
  createPostmarkEmailSender,
  validatePostmarkFrom,
} from '@codaco/studio-sync/postmark-email-sender';

import type { RegistryEnv } from './env.ts';
import { admitRegistryRate } from './rate-limit.ts';

/** Registry identity is independent of every Studio instance's mail or account. */
export function createRegistryMailer(
  configuration: RegistryEnv['mailer'],
  pool: pg.Pool,
  dailyLimit: number,
) {
  const from =
    configuration.kind === 'postmark'
      ? validatePostmarkFrom(configuration.from)
      : validateEmailAddress(configuration.from);
  const sender =
    configuration.kind === 'smtp'
      ? createSmtpEmailSender({ url: configuration.url })
      : createPostmarkEmailSender({
          serverToken: configuration.serverToken,
          messageStream: configuration.messageStream,
        });
  return {
    async sendMagicLink(
      this: void,
      {
        email,
        url,
      }: {
        email: string;
        url: string;
      },
    ): Promise<void> {
      await admitRegistryRate(pool, 'magic-link:daily', dailyLimit, 86400);
      await sender.send({
        from,
        to: email,
        subject: 'Sign in to the Network Canvas Template Registry',
        text: [
          'Use this link to sign in to the Network Canvas Template Registry:',
          '',
          url,
          '',
          'The link expires in 5 minutes and can be used once.',
          'If you did not request it, you can ignore this email.',
        ].join('\n'),
      });
    },
    close() {
      sender.close();
    },
  };
}
