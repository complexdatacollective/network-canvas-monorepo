import { z } from 'zod/mini';

import {
  createAppIntl,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';

const messages = defineMessages({
  validation1: {
    id: 'fresco.validation.participant.validation1',
    defaultMessage: 'Identifier cannot be empty',
    description:
      'Validation error under the identifier field when adding or editing a participant, and for CSV rows, when the identifier is missing or empty. The identifier is the unique ID that distinguishes a participant.',
  },
  validation2: {
    id: 'fresco.validation.participant.validation2',
    defaultMessage: 'Identifier too long. Maximum of 255 characters.',
    description:
      'Validation error under the identifier field when adding or editing a participant, when a required identifier is longer than 255 characters.',
  },
  validation3: {
    id: 'fresco.validation.participant.validation3',
    defaultMessage:
      'Identifier requires one or more non-whitespace characters.',
    description:
      'Validation error under the identifier field when adding or editing a participant, when the identifier contains only spaces.',
  },
  validation4: {
    id: 'fresco.validation.participant.validation4',
    defaultMessage: 'Identifier too long. Maximum of 255 characters.',
    description:
      'Validation error for an optional participant identifier, as in a row of an imported CSV file whose identifier is longer than 255 characters.',
  },
  validation5: {
    id: 'fresco.validation.participant.validation5',
    defaultMessage: 'Label requires one or more non-whitespace characters.',
    description:
      'Validation error for a participant label when a label is required, as in a row of an imported CSV file that has no identifier, and the label is missing or only spaces. The label is an optional display name.',
  },
  validation6: {
    id: 'fresco.validation.participant.validation6',
    defaultMessage: 'Invalid CSV',
    description:
      'Error shown in the participant CSV import dialog when the chosen file is not a valid list of participants.',
  },
  validation7: {
    id: 'fresco.validation.participant.validation7',
    defaultMessage:
      'Invalid CSV. Every row must have either a label or an identifier',
    description:
      'Error shown in the participant CSV import dialog when at least one row of the file has neither a label nor an identifier.',
  },
});

// Utility function to check for non-whitespace characters
const hasNonWhitespaceCharacters = (input: string | undefined) =>
  input && input.length > 0;

export function createParticipantSchemas(
  formatMessage: (message: MessageDescriptor) => string = createAppIntl({
    locale: 'en',
  }).formatMessage,
) {
  const participantIdentifierSchema = z
    .string({ error: formatMessage(messages.validation1) })
    .check(z.minLength(1, formatMessage(messages.validation1)))
    .check(z.maxLength(255, formatMessage(messages.validation2)))
    .check(z.trim())
    .check(
      z.refine(hasNonWhitespaceCharacters, formatMessage(messages.validation3)),
    );

  const participantIdentifierOptionalSchema = z.optional(
    z.pipe(
      z
        .string()
        .check(z.maxLength(255, formatMessage(messages.validation4)))
        .check(z.trim()),
      z.transform((e) => (e === '' ? undefined : e)),
    ),
  );

  const participantLabelSchema = z.optional(
    z.pipe(
      z.string().check(z.trim()),
      z.transform((e) => (e === '' ? undefined : e)),
    ),
  );

  const participantLabelRequiredSchema = z
    .string({ error: formatMessage(messages.validation5) })
    .check(z.trim())
    .check(
      z.refine(hasNonWhitespaceCharacters, formatMessage(messages.validation5)),
    );

  const ParticipantRowSchema = z.union([
    z.object({
      identifier: participantIdentifierSchema,
      label: participantLabelSchema,
    }),
    z.object({
      label: participantLabelRequiredSchema,
      identifier: participantIdentifierOptionalSchema,
    }),
  ]);

  const FormSchema = z.object({
    csvFile: z.array(ParticipantRowSchema, {
      message: formatMessage(messages.validation6),
    }),
  });

  // Used for import
  const participantListInputSchema = z.array(ParticipantRowSchema);

  const updateSchema = z.object({
    existingIdentifier: participantIdentifierSchema,
    formData: z.object({
      identifier: participantIdentifierSchema,
      label: participantLabelSchema,
    }),
  });

  // CSV validation schemas used by DropzoneField
  const csvRowSchema = z.object({
    label: z.optional(z.string()),
    identifier: z.optional(z.string()),
  });

  const csvDataSchema = z
    .array(csvRowSchema)
    .check(
      z.refine(
        (rows) =>
          rows.every(
            (row) =>
              (row.label !== undefined && row.label !== '') ||
              row.identifier !== undefined,
          ),
        formatMessage(messages.validation7),
      ),
    );
  return {
    participantIdentifierSchema,
    participantIdentifierOptionalSchema,
    participantLabelSchema,
    participantLabelRequiredSchema,
    ParticipantRowSchema,
    FormSchema,
    participantListInputSchema,
    updateSchema,
    csvDataSchema,
  };
}

// Provider-optional English schemas retain the existing validation API for
// non-UI callers. Researcher forms and actions instantiate with their formatter.
export const {
  participantIdentifierSchema,
  participantIdentifierOptionalSchema,
  participantLabelSchema,
  participantLabelRequiredSchema,
  ParticipantRowSchema,
  FormSchema,
  updateSchema,
} = createParticipantSchemas();

export type FormSchema = z.infer<typeof FormSchema>;
