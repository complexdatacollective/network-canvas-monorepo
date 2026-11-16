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
    description:
      'Validation error under the Endpoint URL field of the S3 storage form when it is left empty.',
  },
  validation2: {
    id: 'fresco.validation.s3Settings.validation2',
    defaultMessage:
      'Endpoint must be a valid http(s) URL and may not target a private, loopback, or link-local address.',
    description:
      'Validation error under the Endpoint URL field of the S3 storage form when the address is not an http or https URL, or points to an internal network address (private, loopback or link-local), which is blocked for security.',
  },
  validation3: {
    id: 'fresco.validation.s3Settings.validation3',
    defaultMessage: 'Public URL must be a valid URL.',
    description:
      'Validation error under the Public URL field of the S3 storage form when the text is not a well-formed web address or is empty.',
  },
  validation4: {
    id: 'fresco.validation.s3Settings.validation4',
    defaultMessage: 'Bucket name is required.',
    description:
      'Validation error under the Bucket Name field of the S3 storage form when it is left empty. A bucket is a named container for files in S3 storage.',
  },
  validation5: {
    id: 'fresco.validation.s3Settings.validation5',
    defaultMessage: 'Region is required.',
    description:
      'Validation error under the Region field of the S3 storage form when it is left empty. Region is the cloud data-centre region of the storage bucket.',
  },
  validation6: {
    id: 'fresco.validation.s3Settings.validation6',
    defaultMessage: 'Access Key ID is required.',
    description:
      'Validation error under the Access Key ID field of the S3 storage form when it is left empty. This is a storage service credential, not a passkey.',
  },
  validation7: {
    id: 'fresco.validation.s3Settings.validation7',
    defaultMessage: 'Secret Access Key is required.',
    description:
      'Validation error under the Secret Access Key field of the S3 storage form when it is left empty. This is a storage service credential.',
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
