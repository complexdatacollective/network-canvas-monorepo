import { COMMON_ERROR_STATUS_MAP } from '@orpc/server';
import { z } from 'zod';

export const REGISTRY_PROBLEMS = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: 'Registry authentication is required.',
  },
  FORBIDDEN: {
    status: 403,
    message: 'This registry account cannot perform that action.',
  },
  REQUEST_TIMEOUT: {
    status: 408,
    message: 'The registry request body timed out.',
  },
  INVALID_REQUEST: {
    status: 400,
    message: 'The request does not match the registry contract.',
  },
  NOT_FOUND: { status: 404, message: 'The registry resource was not found.' },
  CONTENT_REMOVED: {
    status: 410,
    message: 'An operator has removed this content.',
  },
  CONFLICT: {
    status: 409,
    message: 'The request conflicts with the current registry state.',
  },
  CONTENT_TOO_LARGE: {
    status: 413,
    message: 'The request exceeds the registry size limit.',
  },
  RATE_LIMITED: {
    status: 429,
    message: 'The registry request limit has been reached.',
  },
  STORAGE_LIMIT_REACHED: {
    status: 409,
    message: 'The registry storage allowance has been reached.',
  },
  ARTIFACT_INVALID: {
    status: 422,
    message: 'The template artifact failed verification.',
  },
  FORMAT_UNSUPPORTED: {
    status: 422,
    message: 'This template exchange format is not supported.',
  },
  SCHEMA_UNSUPPORTED: {
    status: 422,
    message: 'This protocol schema version is not supported.',
  },
  CURATION_METADATA_REQUIRED: {
    status: 422,
    message: 'Curation requires an author, description, and keywords.',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'The registry is temporarily unavailable.',
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: 'The registry could not complete this request.',
  },
} as const;

export type RegistryProblemCode = keyof typeof REGISTRY_PROBLEMS;

export const registryErrorStatuses: Record<string, number> = {
  ...COMMON_ERROR_STATUS_MAP,
  ...Object.fromEntries(
    Object.entries(REGISTRY_PROBLEMS).map(([code, problem]) => [
      code,
      problem.status,
    ]),
  ),
};

export const ProblemContextSchema = z
  .strictObject({
    supported_schema_version: z.number().int().positive().optional(),
    artifact_schema_version: z.number().int().positive().optional(),
    retry_after_seconds: z.number().int().positive().max(86_400).optional(),
  })
  .optional();

export function isRegistryProblemCode(
  value: unknown,
): value is RegistryProblemCode {
  return typeof value === 'string' && Object.hasOwn(REGISTRY_PROBLEMS, value);
}
const [firstProblemCode, ...otherProblemCodes] = Object.keys(
  REGISTRY_PROBLEMS,
).filter(isRegistryProblemCode);
if (firstProblemCode === undefined)
  throw new Error('REGISTRY_PROBLEM_CATALOG_EMPTY');

export const RegistryProblemSchema = z
  .strictObject({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.enum([firstProblemCode, ...otherProblemCodes]),
    request_id: z.uuid(),
    context: ProblemContextSchema,
  })
  .meta({ id: 'RegistryProblem' });

export class RegistryError extends Error {
  readonly code: RegistryProblemCode;
  readonly context: z.infer<typeof ProblemContextSchema>;

  constructor(
    code: RegistryProblemCode,
    context?: z.infer<typeof ProblemContextSchema>,
  ) {
    super(REGISTRY_PROBLEMS[code].message);
    this.code = code;
    this.context = context;
  }
}

export function registryProblem(
  code: RegistryProblemCode,
  requestId: string,
  context?: z.infer<typeof ProblemContextSchema>,
) {
  return RegistryProblemSchema.parse({
    type: `urn:networkcanvas:template-registry:v1:${code.toLowerCase().replaceAll('_', '-')}`,
    title: REGISTRY_PROBLEMS[code].message,
    status: REGISTRY_PROBLEMS[code].status,
    code,
    request_id: requestId,
    ...(context === undefined ? {} : { context }),
  });
}
