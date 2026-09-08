import { useRef } from 'react';
import { z } from 'zod/mini';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type {
  FieldValue,
  ValidationPropsCatalogue,
} from '@codaco/fresco-ui/form/Field/types';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import { getValidations } from '~/utils/validations';
const messages = defineMessages({
  hint: {
    id: 'architect.fieldValidation.nameHint',
    defaultMessage: 'Use only letters, numbers and the symbols ._-:',
    description:
      'Hint for researcher-authored technical names that must be valid XML names.',
  },
  required: {
    id: 'architect.fieldValidation.required',
    defaultMessage: 'This field is required.',
    description:
      'Required field error in the researcher-facing protocol editor.',
  },
  name: {
    id: 'architect.fieldValidation.name',
    defaultMessage: 'attribute name',
    description:
      'Default subject name used by the technical-name validation error.',
  },
  invalidName: {
    id: 'architect.fieldValidation.invalidName',
    defaultMessage:
      'Not a valid {name}. Only letters, numbers and the symbols ._-: are supported',
    description:
      'Error for a technical name containing unsupported characters. Name identifies the field.',
  },
});

/**
 * Architect's validation configuration: a map of rule name to rule parameter,
 * as consumed today by `getValidations`. A parameter may be a scalar, the
 * `{ value, message }` custom-message shape, or a bare validator function
 * (which `getValidations` uses verbatim, ignoring the key).
 */
export type ArchitectValidation = Record<string, unknown>;

/**
 * The fresco-ui `Field` validation props Architect rules are expressed through
 * natively — the subset of fresco-ui's catalogue Architect has a genuine
 * equivalent for.
 */
export type NativeValidationProps = Pick<
  ValidationPropsCatalogue,
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'minValue'
  | 'maxValue'
  | 'minSelected'
  | 'maxSelected'
  | 'pattern'
>;

export type SplitValidation = {
  /** Rules handed to fresco-ui's own validators through `Field`'s props. */
  nativeProps: NativeValidationProps;
  /**
   * Every remaining rule, composed into ONE custom entry so each Architect
   * validator's message survives verbatim. Absent when nothing needs it.
   */
  custom?: CustomFieldValidation;
};

/** Architect's "rule with an author-supplied message" shape. */
type MessageOption = { value?: unknown; message: string };

function isMessageOption(option: unknown): option is MessageOption {
  return (
    option !== null &&
    typeof option === 'object' &&
    !Array.isArray(option) &&
    'message' in option &&
    typeof (option as { message: unknown }).message === 'string'
  );
}

/** A rule parameter, unwrapped from the `{ value, message }` shape. */
type Rule = {
  value: unknown;
  message?: string;
};

function readRule(option: unknown): Rule {
  if (isMessageOption(option)) {
    return { value: option.value, message: option.message };
  }
  return { value: option };
}

/**
 * The NMTOKEN character class shared by `allowedVariableName`/`allowedNMToken`.
 * Kept as a source string because fresco-ui's `pattern` validator builds its
 * own `RegExp` from one.
 */
const NMTOKEN_PATTERN = '^[a-zA-Z0-9._\\-:]+$';
const defaultIntl = createAppIntl({ locale: 'en' });

/**
 * fresco-ui's built-in required copy addresses a participant mid-interview;
 * Architect is researcher-facing, so it states the rule instead.
 */

/**
 * Maps one Architect rule onto fresco-ui `Field` props, or returns `null` to
 * say "no honest native equivalent — route this rule through `custom`".
 *
 * `claimed` is the set of native props already produced by earlier rules in
 * the same config: two Architect rules can target the same fresco-ui prop
 * (e.g. `positiveNumber` and `minValue`), and the loser falls back to `custom`
 * rather than silently overwriting the winner.
 */
type NativeMapper = (
  rule: Rule,
  claimed: NativeValidationProps,
  config: ArchitectValidation,
  intl: IntlShape,
) => NativeValidationProps | null;

type NumericProp =
  | 'minLength'
  | 'maxLength'
  | 'minValue'
  | 'maxValue'
  | 'maxSelected';

/** A plain numeric bound with no author message maps straight across. */
const numericBound =
  (prop: NumericProp): NativeMapper =>
  ({ value, message }, claimed) => {
    // fresco-ui's numeric validators own their message and accept no override,
    // so an author-supplied message can only be honoured through `custom`.
    if (message !== undefined) return null;
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    if (prop in claimed) return null;
    return { [prop]: value };
  };

/**
 * `required` and `requiredAcceptsZero` both take `(isRequired, message)`.
 * They differ in one respect that matters here: `required`'s first argument
 * may itself BE the message (`required: 'Pick a colour'`), while
 * `requiredAcceptsZero`'s is only ever a flag.
 */
const requiredLike =
  (stringParameterIsMessage: boolean): NativeMapper =>
  ({ value, message }, claimed, _config, intl) => {
    if ('required' in claimed) return null;

    const isMessageParameter =
      stringParameterIsMessage && typeof value === 'string';
    const enabled = isMessageParameter ? true : Boolean(value);
    const resolvedMessage = isMessageParameter ? value : message;

    // Architect's `required(false)` is a no-op. Emitting `required={false}`
    // would validate the same way but still mark the control aria-required.
    if (!enabled) return {};

    // fresco-ui's built-in copy is participant-voice; Architect is
    // researcher-facing. Author-supplied messages win.
    return {
      required: resolvedMessage ?? intl.formatMessage(messages.required),
    };
  };

/**
 * `allowedVariableName`/`allowedNMToken` is a regular-expression constraint
 * with a caller-named subject — fresco-ui's `pattern` carries both the
 * expression and the exact error message.
 */
const allowedVariableName: NativeMapper = (
  { value },
  claimed,
  _config,
  intl,
) => {
  if ('pattern' in claimed) return null;
  // Architect's factory defaults the subject name and ignores its second
  // (message) argument entirely, so a non-string parameter — such as the
  // `allowedNMToken: true` call sites — falls back to the default instead of
  // interpolating `true` into the message.
  const name =
    typeof value === 'string' ? value : intl.formatMessage(messages.name);
  return {
    pattern: {
      regex: NMTOKEN_PATTERN,
      errorMessage: intl.formatMessage(messages.invalidName, { name }),
      hint: intl.formatMessage(messages.hint),
    },
  };
};

const REQUIRED_RULE_NAMES = ['required', 'requiredAcceptsZero'];

const nativeMappers: Record<string, NativeMapper> = {
  required: requiredLike(true),

  /**
   * `requiredAcceptsZero` rejects only null/undefined. fresco-ui's `required`
   * also accepts `0`, `false` and populated arrays, so the intent — "zero is a
   * real answer" — carries over. It additionally rejects `''`, which Architect
   * accepted; for the numeric inputs this rule guards, an empty input is the
   * unanswered state, so that is a fix rather than a loss.
   */
  requiredAcceptsZero: requiredLike(false),

  minLength: numericBound('minLength'),
  maxLength: numericBound('maxLength'),
  minValue: numericBound('minValue'),
  maxValue: numericBound('maxValue'),
  maxSelected: numericBound('maxSelected'),

  /**
   * Architect's `minSelected` also rejects an absent or empty selection;
   * fresco-ui's deliberately short-circuits on `[]` (its own note: pair it
   * with `required` to reject an empty selection). Emitting both is the
   * documented fresco-ui idiom for Architect's semantics — but only when the
   * config does not state `required` itself, anywhere in the object.
   */
  minSelected: ({ value, message }, claimed, config, intl) => {
    if (message !== undefined) return null;
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    if ('minSelected' in claimed) return null;

    const props: NativeValidationProps = { minSelected: value };
    if (!REQUIRED_RULE_NAMES.some((rule) => rule in config)) {
      props.required = intl.formatMessage(messages.required);
    }
    return props;
  },

  /**
   * `positiveNumber` rejects negatives and accepts zero and empty — exactly
   * fresco-ui's `minValue: 0`. Its parameter is ignored by Architect's
   * factory, so it is ignored here too.
   */
  positiveNumber: ({ message }, claimed) => {
    if (message !== undefined) return null;
    if ('minValue' in claimed) return null;
    return { minValue: 0 };
  },

  allowedVariableName,
  allowedNMToken: allowedVariableName,
};

/**
 * Partitions an Architect validation config into the rules fresco-ui runs
 * natively and the rules that keep running through `~/utils/validations`.
 */
function partitionRules(
  validation: ArchitectValidation,
  intl: IntlShape,
): {
  nativeProps: NativeValidationProps;
  customConfig: ArchitectValidation;
} {
  const nativeProps: NativeValidationProps = {};
  const customConfig: ArchitectValidation = {};

  for (const [name, option] of Object.entries(validation)) {
    // A function parameter IS the validator, whatever the key is named
    // (`notEmpty`, `crossClassPick`, a locally-defined `minValue`…), so it can
    // never be reinterpreted as a native rule.
    if (typeof option === 'function') {
      customConfig[name] = option;
      continue;
    }

    const mapped = nativeMappers[name]?.(
      readRule(option),
      nativeProps,
      validation,
      intl,
    );

    if (!mapped) {
      customConfig[name] = option;
      continue;
    }

    Object.assign(nativeProps, mapped);
  }

  return { nativeProps, customConfig };
}

/**
 * Builds the single `custom` entry that runs Architect's own validators.
 *
 * Each validator keeps its `(value, allValues, props, name)` signature, so
 * cross-field rules read the reassembled form values and name-sensitive rules
 * (`uniqueArrayAttribute`) see the field's resolved bracket path. The first
 * failing rule wins — one error per field.
 *
 * Both the config and the field name are read through getters so a caller can
 * keep one `custom` object alive across renders while its inputs change.
 */
function makeCustomValidation(
  getCustomConfig: () => ArchitectValidation,
  getFieldName: () => string,
  getIntl: () => IntlShape,
): CustomFieldValidation {
  return {
    schema: (formValues: Record<string, FieldValue>) =>
      z.unknown().check(
        z.superRefine((value, ctx) => {
          const fieldName = getFieldName();
          for (const validator of getValidations(
            getCustomConfig(),
            getIntl(),
          )) {
            const message = validator(value, formValues, undefined, fieldName);
            if (message) {
              ctx.addIssue({
                code: 'custom',
                input: value,
                message,
                path: [],
              });
              return;
            }
          }
        }),
      ),
    // Architect carries no per-rule hint metadata to derive one from, and never
    // enables `showValidationHints`, so the required hint slot stays empty.
    hint: '',
  };
}

/**
 * Adapts an Architect validation config into fresco-ui `Field` validation
 * props.
 *
 * @param validation Architect's rule-name → parameter map.
 * @param fieldName The field's resolved name, passed to Architect validators
 *   as their fourth argument (`uniqueArrayAttribute` parses it for the
 *   `foo[3].bar` bracket path).
 */
export function splitValidation(
  validation: ArchitectValidation = {},
  fieldName: string,
  intl: IntlShape = defaultIntl,
): SplitValidation {
  const { nativeProps, customConfig } = partitionRules(validation, intl);

  if (Object.keys(customConfig).length === 0) {
    return { nativeProps };
  }

  return {
    nativeProps,
    custom: makeCustomValidation(
      () => customConfig,
      () => fieldName,
      () => intl,
    ),
  };
}

/**
 * `splitValidation` for use inside a field component.
 *
 * `useField` memoises its validation function on `JSON.stringify` of the
 * validation props, and functions do not survive that serialisation: a config
 * carrying validator closures (or a `custom` entry rebuilt each render)
 * serialises identically every time, so the memo would pin the very first
 * closure forever. This keeps ONE `custom` entry for the field's lifetime
 * whose schema reads the latest config through a ref, so a changed config
 * never re-registers the field.
 */
export function useValidationProps(
  validation: ArchitectValidation | undefined,
  fieldName: string,
): SplitValidation {
  const intl = useAppIntl();
  const intlRef = useRef(intl);
  intlRef.current = intl;
  const validationRef = useRef(validation);
  validationRef.current = validation;
  const fieldNameRef = useRef(fieldName);
  fieldNameRef.current = fieldName;

  const customRef = useRef<CustomFieldValidation | undefined>(undefined);
  customRef.current ??= makeCustomValidation(
    () =>
      partitionRules(validationRef.current ?? {}, intlRef.current).customConfig,
    () => fieldNameRef.current,
    () => intlRef.current,
  );

  const { nativeProps, customConfig } = partitionRules(validation ?? {}, intl);

  // Whether `custom` is present is part of useField's serialised memo key, so
  // a config that gains or loses custom rules still re-derives its validation.
  if (Object.keys(customConfig).length === 0) {
    return { nativeProps };
  }

  return { nativeProps, custom: customRef.current };
}
