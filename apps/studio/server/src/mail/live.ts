import { Effect, Layer } from 'effect';

import { Environment } from '../env.ts';
import { Mailer } from './mailer.ts';
import { MailerSmtp } from './smtp.ts';

// The transport a deployment actually got. The only importer of src/mail/smtp.ts
// and so the only path by which nodemailer reaches a program's module graph;
// src/__tests__/process-separation.test.ts holds that.

export const MailerLive: Layer.Layer<Mailer, never, Environment> = Layer.unwrap(
  Effect.map(Environment, (env) => {
    const mail = env.mail;
    switch (mail?.kind) {
      case 'smtp':
        return MailerSmtp({ url: mail.url, from: mail.from });
      case 'console':
        return Mailer.layerConsole;
      // `refuse` and undefined are the same posture from here: nothing to send
      // through. They differ only in what the absence means to the process that
      // read the environment (src/env.ts).
      default:
        return Mailer.layerRefuse;
    }
  }),
);
