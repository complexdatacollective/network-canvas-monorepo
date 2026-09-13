import { z } from 'zod';

import { TemplateContentHashSchema } from '@codaco/studio-sync/template-exchange';
import {
  OrcidSchema,
  StrictUuidSchema,
} from '@codaco/studio-sync/template-metadata';
import {
  RegistryPublisherNameSchema,
  RegistryPublisherSchema,
} from '@codaco/studio-sync/template-registry-contract';

import { paginatedPageSchema } from './pagination.ts';

const boundedNonblank = (maximum: number) =>
  z
    .string()
    .min(1)
    .refine(
      (value) =>
        Array.from(value).length <= maximum &&
        value.trim().length > 0 &&
        value.isWellFormed() &&
        !value.includes('\0'),
      {
        message: `Must be a nonblank string of at most ${maximum} Unicode code points`,
      },
    )
    .meta({
      maxLength: maximum,
      pattern: '^(?=[\\s\\S]*\\S)[\\s\\S]+$(?![\\s\\S])',
    });
const stamp = z.iso.datetime();
export const PublisherSchema = RegistryPublisherSchema;
export const ClaimPublisherSchema = z.strictObject({
  name: RegistryPublisherNameSchema,
  orcid: OrcidSchema.optional(),
});
const TokenScopeSchema = z.enum(['publish', 'moderate']);
export const CreateTokenSchema = z.strictObject({
  name: boundedNonblank(100),
  scopes: z
    .array(TokenScopeSchema)
    .min(1)
    .max(2)
    .refine((scopes) => new Set(scopes).size === scopes.length),
  lifetime_days: z.number().int().min(1).max(365).default(90),
});
export const TokenDescriptionSchema = z.strictObject({
  id: StrictUuidSchema,
  name: CreateTokenSchema.shape.name,
  scopes: z.array(TokenScopeSchema).min(1).max(2),
  created_at: stamp,
  expires_at: stamp,
  revoked_at: z.null(),
});
export const ReportSchema = z.strictObject({
  category: z.enum([
    'privacy',
    'copyright',
    'harmful_content',
    'spam',
    'other',
  ]),
  details: boundedNonblank(2000),
});
export type RegistryReport = z.infer<typeof ReportSchema>;

const maximumSequence = '9223372036854775807';
// Enumerate the first digit that is smaller than PostgreSQL's positive bigint
// maximum. Unlike a refinement, this bound also survives OpenAPI generation.
const sequenceBranches = maximumSequence.split('').flatMap((digit, index) => {
  const minimum = index === 0 ? 1 : 0;
  const maximum = Number(digit) - 1;
  return maximum < minimum
    ? []
    : `${maximumSequence.slice(0, index)}[${minimum}-${maximum}][0-9]{${maximumSequence.length - index - 1}}`;
});
export const RegistrySequenceSchema = z
  .string()
  .regex(
    new RegExp(
      `^(?:[1-9][0-9]{0,17}|${sequenceBranches.join('|')}|${maximumSequence})$(?![\\s\\S])`,
    ),
  );
export const ReportCursorSchema = RegistrySequenceSchema.describe(
  'Decimal report sequence returned by the preceding reports page, from 1 through 9223372036854775807 inclusive.',
);

export const AccountSchema = z.strictObject({
  id: z.string().min(1).max(255),
  email: z.string().min(1).max(320),
  publisher: PublisherSchema.nullable(),
  suspended: z.boolean(),
  operator: z.boolean(),
});

export const ReportsPageSchema = paginatedPageSchema(
  z.strictObject({
    id: StrictUuidSchema,
    entry_id: StrictUuidSchema,
    artifact_root: TemplateContentHashSchema,
    publisher_id: StrictUuidSchema,
    category: ReportSchema.shape.category,
    details: ReportSchema.shape.details.nullable(),
    created_at: stamp,
  }),
  ReportCursorSchema,
);
