import type * as z from 'zod/mini';

import type { Codebook, StageSubject } from '@codaco/protocol-validation';
import type {
  EntityAttributesProperty,
  NcNetwork,
  NcNode,
} from '@codaco/shared-consts';

import type { ObjectPath } from '../utils/objectPath';

// Re-export FieldValue for convenience
export type { FieldValue } from '../Field/types';

import type { FieldValue } from '../Field/types';

// ═══════════════════════════════════════════════════════════════
// Validation types
// ═══════════════════════════════════════════════════════════════

/**
 * Represents the result of a Zod schema's `safeParseAsync` operation.
 *
 * This is the discriminated union returned by Zod's safe parsing methods:
 * - On success: `{ success: true, data: T }`
 * - On failure: `{ success: false, error: z.ZodError }`
 *
 * Used as the return type for field validation functions.
 *
 * @template T - The Zod schema type being validated against
 */
export type ValidationResult<T extends z.ZodMiniType = z.ZodMiniType> = Awaited<
  ReturnType<T['safeParseAsync']>
>;

/**
 * Schema for custom validation - can be a Zod schema directly, or a function
 * that receives form values and validation context and returns a schema.
 */
export type FieldValidationFunction =
  | z.ZodMiniType
  | ((
      formValues: Record<string, FieldValue>,
      validationContext?: ValidationContext,
    ) => z.ZodMiniType | Promise<z.ZodMiniType>);

/**
 * Custom field validation with required hint metadata.
 * The schema can be a Zod schema directly, or a function that receives
 * form values and validation context and returns a schema.
 */
export type CustomFieldValidation = {
  schema: FieldValidationFunction;
  hint: string;
};

/**
 * Context object passed to custom validation functions
 *
 * Some validation functions require that additional context be provided,
 * such as the current stage subject or codebook, to perform their checks.
 */
export type ValidationContext = {
  stageSubject: StageSubject;
  codebook: Codebook;
  network: NcNetwork;
  currentEntityId?: string;
  currentEntityAttributes?: NcNode[EntityAttributesProperty];
  /** Resolve form-to-form comparison rules within this FieldNamespace. */
  formValueNamespace?: string;
  /** Typed namespace used by the built-in comparison validators. */
  formValueNamespacePath?: ObjectPath;
  /**
   * Map a codebook variable ID to the form key that currently represents it.
   * The original ID remains authoritative for codebook and entity lookups.
   */
  formValueAliases?: Readonly<Record<string, string>>;
  /**
   * Map a codebook variable ID to the participant-facing text that introduces
   * it on this screen — the prompt or label the researcher authored. The
   * variable-comparison validators name their target with it.
   *
   * Only AUTHORED text belongs here: a codebook variable's `name` is a
   * researcher-facing identifier and must never reach a participant, so a
   * variable with nothing authored is simply absent from this map and the
   * validators use a complete label-free sentence instead.
   */
  variableLabels?: Readonly<Record<string, string>>;
};

// ═══════════════════════════════════════════════════════════════
// Core form state types
// ═══════════════════════════════════════════════════════════════

export type FieldState = {
  /** Internal structural path retained by the built-in form store. */
  path?: ObjectPath;
  submissionErrorKey?: string;
  value: FieldValue;
  initialValue?: FieldValue;
  meta: {
    isValidating: boolean;
    isTouched: boolean;
    isBlurred: boolean;
    isDirty: boolean;
    isValid: boolean;
  };
  validation?: FieldValidationFunction;
};

export type FieldConfig = {
  name: string;
  submissionErrorKey?: string;
  initialValue?: FieldValue;
  validation?: FieldValidationFunction;
};

// ═══════════════════════════════════════════════════════════════
// Submission handling
// ═══════════════════════════════════════════════════════════════

/**
 * Flattened errors type - uses Zod's core flattened error type
 * This ensures compatibility with z.flattenError() output for any schema
 */
export type FlattenedErrors = z.core.$ZodFlattenedError<
  Record<string, FieldValue>
>;

/**
 * Form submission result type
 * Designed to be compatible with Zod's flattenError output
 */
export type FormSubmissionResult =
  | {
      success: true;
    }
  | ({
      success: false;
    } & Partial<FlattenedErrors>);

export type FormSubmitHandler<T = Record<string, FieldValue>> = (
  values: T,
) => FormSubmissionResult | Promise<FormSubmissionResult>;

export type FormConfig = {
  onSubmit: FormSubmitHandler;
  onSubmitInvalid?: (errors: FlattenedErrors) => void;
};
