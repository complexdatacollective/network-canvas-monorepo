import { Effect, Layer } from 'effect';

import { Environment } from '../env.ts';
import { Mailer } from './mailer.ts';
import { MailerSmtp } from './smtp.ts';

export const MailerLive: Layer.Layer<Mailer, never, Environment> = Layer.unwrap(
  Effect.map(Environment, (env) => {
    const mail = env.mail;
    switch (mail?.kind) {
      case 'smtp':
        return MailerSmtp({ url: mail.url, from: mail.from });
      case 'console':
        return Mailer.layerConsole;
      default:
        return Mailer.layerRefuse;
    }
  }),
);
