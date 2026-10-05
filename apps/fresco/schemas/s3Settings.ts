import { z as zm } from 'zod/mini';

import {
  createAppIntl,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { isSafeHttpUrl } from '~/utils/safeUrl';

const messages = defineMessages({
  validation1: {
    id: 'fresco.validation.s3Settings.validation1',
    defaultMessage: 'Endpoint URL is required.',
    description: 'Form validation for s3Settings: Endpoint URL is required.',
  },
  validation2: {
    id: 'fresco.validation.s3Settings.validation2',
    defaultMessage:
      'Endpoint must be a valid http(s) URL and may not target a private, loopback, or link-local address.',
    description:
      'Form validation for s3Settings: Endpoint must be a valid http(s) URL and may not target a private, loopback, or link-local address.',
  },
  validation3: {
    id: 'fresco.validation.s3Settings.validation3',
    defaultMessage: 'Public URL must be a valid URL.',
    description:
      'Form validation for s3Settings: Public URL must be a valid URL.',
  },
  validation4: {
    id: 'fresco.validation.s3Settings.validation4',
    defaultMessage: 'Bucket name is required.',
    description: 'Form validation for s3Settings: Bucket name is required.',
  },
  validation5: {
    id: 'fresco.validation.s3Settings.validation5',
    defaultMessage: 'Region is required.',
    description: 'Form validation for s3Settings: Region is required.',
  },
  validation6: {
    id: 'fresco.validation.s3Settings.validation6',
    defaultMessage: 'Access Key ID is required.',
    description: 'Form validation for s3Settings: Access Key ID is required.',
  },
  validation7: {
    id: 'fresco.validation.s3Settings.validation7',
    defaultMessage: 'Secret Access Key is required.',
    description:
      'Form validation for s3Settings: Secret Access Key is required.',
  },
});

export function createS3SettingsSchemas(
  formatMessage: (message: MessageDescriptor) => string = createAppIntl({
    locale: 'en',
  }).formatMessage,
) {
  const s3ConfigSchema = zm.object({
    s3Endpoint: zm
      .string({ error: formatMessage(messages.validation1) })
      .check(
        zm.minLength(1, formatMessage(messages.validation1)),
        zm.refine(isSafeHttpUrl, formatMessage(messages.validation2)),
      ),
    s3PublicUrl: zm.url(formatMessage(messages.validation3)),
    s3Bucket: zm
      .string({ error: formatMessage(messages.validation4) })
      .check(zm.minLength(1, formatMessage(messages.validation4))),
    s3Region: zm
      .string({ error: formatMessage(messages.validation5) })
      .check(zm.minLength(1, formatMessage(messages.validation5))),
    s3AccessKeyId: zm
      .string({ error: formatMessage(messages.validation6) })
      .check(zm.minLength(1, formatMessage(messages.validation6))),
    s3SecretAccessKey: zm
      .string({ error: formatMessage(messages.validation7) })
      .check(zm.minLength(1, formatMessage(messages.validation7))),
  });
  return { s3ConfigSchema };
}

// Provider-optional English schemas retain the existing validation API for
// non-UI callers. Researcher forms and actions instantiate with their formatter.
const { s3ConfigSchema } = createS3SettingsSchemas();

export type S3EnvValues = zm.infer<typeof s3ConfigSchema>;
