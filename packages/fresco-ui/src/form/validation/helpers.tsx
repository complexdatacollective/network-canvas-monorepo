import { z } from 'zod/mini';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';

import { UnorderedList } from '../../typography/UnorderedList';
import type {
  CustomFieldValidation,
  FieldValidationFunction,
  FieldValue,
  ValidationContext,
  ValidationResult,
} from '../store/types';
import {
  type ValidationFunction,
  type ValidationParameter,
  validationPropKeys,
  validations,
} from './functions';

const messages = defineMessages({
  unexpectedError: {
    id: 'frescoUi.validation.unexpectedError',
    defaultMessage: 'An error occurred while validating.',
    description:
      'Error shown when a validation rule itself throws unexpectedly.',
  },
});

let defaultHelperIntl: IntlShape | undefined;

// English fallback for callers that thread no intl — see the seam note on
// `ValidationFunction` in ./functions.ts.
const helperIntl = (intl?: IntlShape): IntlShape => {
  if (intl) return intl;
  defaultHelperIntl ??= createAppIntl({ locale: 'en' });
  return defaultHelperIntl;
};

/**
 * Validates a field value against a validation schema.
 *
 * This function handles both static Zod schemas and dynamic validation functions
 * that generate schemas based on form state. It uses Zod's `safeParseAsync` for
 * non-throwing validation that returns a discriminated union result.
 *
 * @template T - The Zod schema type, defaults to `z.ZodMiniType`
 *
 * @param value - The field value to validate
 * @param validation - Either a Zod schema directly, or a function that receives
 *   the current form values and returns a Zod schema (sync or async)
 * @param formValues - Current values of all form fields, used when validation
 *   depends on other field values (e.g., sameAs, differentFrom validations)
 *
 * @returns A promise resolving to a `ValidationResult<T>`:
 *   - On success: `{ success: true, data: T }` where data is the parsed value
 *   - On failure: `{ success: false, error: z.ZodError }` containing validation issues
 */
export async function validateFieldValue<T extends z.ZodMiniType>(
  value: unknown,
  validation: FieldValidationFunction,
  formValues: Record<string, FieldValue>,
): Promise<ValidationResult<T>> {
  const schema =
    typeof validation === 'function'
      ? await validation(formValues)
      : validation;

  return (await schema.safeParseAsync(value)) as ValidationResult<T>;
}

/**
 * A rule that judges a whole field value and answers with the message to show,
 * or nothing when the value passes.
 *
 * The shape a rule takes when it is a piece of domain reasoning rather than a
 * constraint from this catalogue — "every option needs a unique value", "every
 * row needs a value in each column". Such a rule has no parameter to name and
 * no hint to render; it has an explanation, and the explanation is its result.
 */
export type MessageRule = (
  value: unknown,
  formValues: Record<string, FieldValue>,
) => string | undefined;

/**
 * Turns plain message rules into the `custom` entry `Field` accepts.
 *
 * Exported because a consumer that owns rules like these — an array editor
 * whose whole list is one field value, above all — would otherwise need Zod as
 * a dependency purely to say "this value is wrong, and here is why". The rules
 * themselves stay plain functions, so they can be read, reused and tested
 * without a schema in sight.
 *
 * The first failing rule wins, matching how a field reports one error at a
 * time: a value that is both incomplete and malformed should say what is
 * missing before it is told the missing part is wrong.
 */
export function messageRuleValidation(
  rules: readonly MessageRule[],
  hint = '',
): CustomFieldValidation {
  return {
    schema: (formValues: Record<string, FieldValue>) =>
      z.unknown().check(
        z.superRefine((value, ctx) => {
          for (const rule of rules) {
            const message = rule(value, formValues);
            if (message === undefined) continue;
            ctx.addIssue({
              code: 'custom',
              input: value,
              message,
              path: [],
            });
            return;
          }
        }),
      ),
    hint,
  };
}

/**
 * Helper function that parses component props and converts them into a validation
 * using functions from ~/components/ui/form/validation/index.ts.
 *
 * Exported for use by UnconnectedField.
 */
export function makeValidationFunction(
  props: Record<string, unknown>,
  intl?: IntlShape,
) {
  const validationContext = props.validationContext as
    | ValidationContext
    | undefined;

  return (formValues: Record<string, FieldValue>) =>
    z.unknown().check(
      z.superRefine(async (fieldValue, ctx) => {
        // Handle built-in validations from the validations object
        const validationEntries = Object.entries(props).filter(
          ([key]) =>
            key in validations &&
            key !== 'validationContext' &&
            key !== 'custom',
        );

        for (const [validationName, parameter] of validationEntries) {
          try {
            const validationFnFactory = validations[
              validationName as keyof typeof validations
            ] as ValidationFunction<ValidationParameter>;

            const validationFn = validationFnFactory(
              parameter as ValidationParameter,
              validationContext,
              intl,
            )(formValues);

            const result = await validationFn.safeParseAsync(fieldValue);

            if (!result.success && result.error) {
              result.error.issues.forEach((issue) => {
                ctx.addIssue({
                  code: 'custom',
                  message: issue.message,
                  path: [...issue.path],
                });
              });
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error while validating:', error);
            ctx.addIssue({
              code: 'custom',
              message: helperIntl(intl).formatMessage(messages.unexpectedError),
            });
          }
        }

        // Handle custom validations (single or array)
        if ('custom' in props && props.custom) {
          const customValidations = Array.isArray(props.custom)
            ? (props.custom as CustomFieldValidation[])
            : [props.custom as CustomFieldValidation];

          for (const { schema } of customValidations) {
            try {
              // Resolve schema if it's a function
              const resolvedSchema =
                typeof schema === 'function'
                  ? await schema(formValues, validationContext)
                  : schema;

              const result = await resolvedSchema.safeParseAsync(fieldValue);

              if (!result.success && result.error) {
                result.error.issues.forEach((issue) => {
                  ctx.addIssue({
                    code: 'custom',
                    message: issue.message,
                    path: [...issue.path],
                  });
                });
              }
            } catch (error) {
              // eslint-disable-next-line no-console
              console.log('custom validation error', error);
              ctx.addIssue({
                code: 'custom',
                message: helperIntl(intl).formatMessage(
                  messages.unexpectedError,
                ),
              });
            }
          }
        }
      }),
    );
}

/**
 * Helper function that generates a human readable summary of the validation rules
 * applied to a field by extracting hint metadata from each validation schema.
 *
 * Exported for use by UnconnectedField.
 */
export function makeValidationHints(
  props: Record<string, unknown>,
  intl?: IntlShape,
) {
  const validationContext = props.validationContext as
    | ValidationContext
    | undefined;

  const validationEntries = Object.entries(props).filter(
    ([key]) =>
      key in validations && key !== 'validationContext' && key !== 'custom',
  );

  const hints: string[] = [];

  for (const [validationName, parameter] of validationEntries) {
    // Skip required=false or other falsy values that indicate no validation
    if (validationName === 'required' && parameter !== true) {
      continue;
    }

    try {
      const validationFnFactory = validations[
        validationName as keyof typeof validations
      ] as ValidationFunction<
        string | number | boolean | { regex: string; hint: string }
      >;

      // Call the factory with the parameter to get the validation function
      // Pass empty object as formValues since we just need metadata
      const validationFn = validationFnFactory(
        parameter as
          | string
          | number
          | boolean
          | { regex: string; hint: string },
        validationContext,
        intl,
      )({});

      // Extract hint from the schema's metadata via global registry
      const meta = z.globalRegistry.get(validationFn);
      if (meta?.hint) {
        hints.push(meta.hint);
      }
    } catch {
      // If we can't get the hint (e.g., missing context for some validations),
      // skip this validation's hint
      // eslint-disable-next-line no-console
      console.warn(`Could not extract hint for validation: ${validationName}`);
    }
  }

  // Handle custom validation hints
  if ('custom' in props && props.custom) {
    const customValidations = Array.isArray(props.custom)
      ? (props.custom as CustomFieldValidation[])
      : [props.custom as CustomFieldValidation];

    for (const { hint } of customValidations) {
      hints.push(hint);
    }
  }

  if (hints.length === 0) {
    return null;
  }

  return (
    <UnorderedList className="mb-0!">
      {hints.map((hint, index) => (
        <li key={index}>{hint}</li>
      ))}
    </UnorderedList>
  );
}

/**
 * Validation keys that are also valid HTML attributes and should reach the
 * underlying component for native constraint UI (e.g. `<input type="date">`
 * honouring `min`/`max` in its picker) in addition to driving validation.
 */
const DUAL_USE_VALIDATION_KEYS = new Set(['min', 'max']);

export function filterValidationProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    const isValidationKey = validationPropKeys.includes(
      key as keyof typeof validations,
    );
    if (!isValidationKey || DUAL_USE_VALIDATION_KEYS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
