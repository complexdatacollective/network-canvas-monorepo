import type { z } from 'zod';

import type {
  ResourceContentKindSchema,
  ResourceDescriptorSchema,
  ResourceFailureReasonSchema,
  ResourceGatewayFailureSchema,
  ResourceInspectionSchema,
  ResourceKindSchema,
  ResourcePreviewSchema,
  ResourceSecretStorageSchema,
  ResourceStatusSchema,
} from '../contract/schemas.ts';

/**
 * The resource vocabulary the editor's controls speak, taken from the contract
 * so there is one definition of each.
 */
export type ResourceKind = z.output<typeof ResourceKindSchema>;
export type ResourceContentKind = z.output<typeof ResourceContentKindSchema>;
export type ResourceStatus = z.output<typeof ResourceStatusSchema>;
export type ResourceSecretStorage = z.output<
  typeof ResourceSecretStorageSchema
>;
export type ResourceDescriptor = z.output<typeof ResourceDescriptorSchema>;
export type ResourceInspection = z.output<typeof ResourceInspectionSchema>;
export type ResourcePreview = z.output<typeof ResourcePreviewSchema>;
export type ResourceFailureReason = z.output<
  typeof ResourceFailureReasonSchema
>;
export type ResourceGatewayFailure = z.output<
  typeof ResourceGatewayFailureSchema
>;

export type ResourceResult<T> =
  | Readonly<{ status: 'ok'; data: T }>
  | Readonly<{ status: 'failed'; failure: ResourceGatewayFailure }>;

/**
 * Names one staged secret. It is not the secret and is not derived from it: it
 * exists so a promotion can ask the host to resolve the value it is holding
 * without the editor ever seeing it.
 */
export type StagedSecretHandle = string;

export type StagedSecret = Readonly<{
  /** Carries the asset id a stage field references; never the value. */
  descriptor: ResourceDescriptor;
  handle: StagedSecretHandle;
}>;

export type ResourceListOptions = Readonly<{
  kinds?: readonly ResourceKind[];
  status?: ResourceStatus;
}>;

export type StageUploadRequest = Readonly<{
  /** Stable across an uncertain retry so a host stages the file once. */
  requestId: string;
  kind: ResourceContentKind;
  name: string;
  /** Filename the manifest will record; no path separators or `..`. */
  source: string;
  contentType: string;
  bytes: Uint8Array;
}>;

export type StageSecretRequest = Readonly<{
  /** Stable across an uncertain retry so a host stages the secret once. */
  requestId: string;
  name: string;
  /**
   * The secret itself. The host consumes it: no procedure returns it, no
   * descriptor or event carries it, and nothing logs it.
   */
  value: string;
}>;

/**
 * The largest file the editor will read into memory to stage it.
 *
 * A limit the editor knows, not only one the host enforces: staging takes
 * bytes, so a control that waits for the host to refuse has already read the
 * whole file to learn it was too big — and the file a researcher picks by
 * mistake is exactly the one large enough to matter. A host may still refuse
 * something smaller, and that refusal is reported as any other is.
 */
export const RESOURCE_UPLOAD_MAX_BYTE_LENGTH = 8 * 1024 * 1024;

/**
 * Reasons that are retryable by default: exactly the ones describing a
 * transient host condition rather than a decision about the request.
 */
const RETRYABLE_REASONS: ReadonlySet<ResourceFailureReason> =
  new Set<ResourceFailureReason>(['promotion-failed', 'unavailable']);

function isRetryableByDefault(reason: ResourceFailureReason): boolean {
  return RETRYABLE_REASONS.has(reason);
}

export function resourceOk<T>(data: T): ResourceResult<T> {
  return Object.freeze({ status: 'ok', data });
}

export function resourceFailure<T>(
  reason: ResourceFailureReason,
  message: string,
  options?: Readonly<{ retryable?: boolean; resourceId?: string }>,
): ResourceResult<T> {
  return Object.freeze({
    status: 'failed',
    failure: Object.freeze({
      reason,
      message,
      retryable: options?.retryable ?? isRetryableByDefault(reason),
      ...(options?.resourceId === undefined
        ? {}
        : { resourceId: options.resourceId }),
    }),
  });
}
