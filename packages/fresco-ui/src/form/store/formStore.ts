import { isEqual } from 'es-toolkit';
import { enableMapSet } from 'immer';
import { immer } from 'zustand/middleware/immer';
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla';

import type { FieldValue } from '../Field/types';
import {
  createObjectPathWriter,
  formatObjectPath,
  getValue as readObjectPath,
  isSafeObjectPath,
  type ObjectPath,
  omitValue,
  parseLegacyObjectPath,
  parseObjectPath,
} from '../utils/objectPath';
import { validateFieldValue } from '../validation/helpers';
import type {
  FieldConfig,
  FieldState,
  FlattenedErrors,
  FormConfig,
  FormSubmitHandler,
} from './types';

// Enable Map/Set support in Immer
enableMapSet();

const internalPathPrefix = '\u0000fresco-path:';

const encodeObjectPath = (path: ObjectPath): string =>
  `${internalPathPrefix}${formatObjectPath(path)}`;

const parseFieldReference = (field: string): ObjectPath | null => {
  const path = field.startsWith(internalPathPrefix)
    ? parseObjectPath(field.slice(internalPathPrefix.length))
    : parseLegacyObjectPath(field);

  if (!path || !isSafeObjectPath(path)) return null;

  return [...path];
};

const resolveFieldPath = (field: string): ObjectPath => {
  const path = parseFieldReference(field);

  if (!path) {
    throw new Error(`Unsafe form field path: ${field}`);
  }

  return path;
};

const resolveFieldName = (field: string): string =>
  formatObjectPath(resolveFieldPath(field));

const resolveStoredFieldPath = (
  fieldName: string,
  field: FieldState,
): ObjectPath => field.path ?? resolveFieldPath(fieldName);

const resolveRegisteredFieldName = (
  fields: Map<string, FieldState>,
  dormantValues: Map<string, FieldState>,
  field: string,
): string => {
  if (field.startsWith(internalPathPrefix)) return resolveFieldName(field);

  const aliases = new Set<string>();
  fields.forEach((state, name) => {
    if (state.submissionErrorKey === field) aliases.add(name);
  });
  dormantValues.forEach((state, name) => {
    if (state.submissionErrorKey === field) aliases.add(name);
  });

  const alias = [...aliases][0];
  const parsedPath = parseLegacyObjectPath(field);
  if (!parsedPath || !isSafeObjectPath(parsedPath)) {
    if (aliases.size === 1 && alias) return alias;
    throw new Error(`Unsafe form field path: ${field}`);
  }

  const canonicalName = formatObjectPath(parsedPath);
  if (fields.has(canonicalName) || dormantValues.has(canonicalName)) {
    return canonicalName;
  }

  return aliases.size === 1 && alias ? alias : canonicalName;
};

/**
 * Whether `candidate` sits strictly beneath `containerPath`.
 *
 * Compared segment by segment rather than by string prefix, so a field whose
 * NAME happens to read like a nested one — an opaque `parameters.type`, a
 * single segment containing a dot — is not mistaken for a descendant of a
 * container it has nothing to do with.
 */
const isDescendantPath = (
  containerPath: ObjectPath,
  candidate: ObjectPath,
): boolean =>
  candidate.length > containerPath.length &&
  containerPath.every((segment, index) => candidate[index] === segment);

const hasDescendantField = (
  records: Map<string, FieldState>,
  containerPath: ObjectPath,
): boolean => {
  for (const [fieldName, field] of records) {
    if (
      isDescendantPath(containerPath, resolveStoredFieldPath(fieldName, field))
    ) {
      return true;
    }
  }

  return false;
};

const collectDescendantPaths = (
  records: Map<string, FieldState>,
  containerPath: ObjectPath,
): ObjectPath[] => {
  const paths: ObjectPath[] = [];
  records.forEach((field, fieldName) => {
    const path = resolveStoredFieldPath(fieldName, field);
    if (isDescendantPath(containerPath, path)) paths.push(path);
  });

  return paths;
};

/**
 * The NEAREST strict prefix of `path` registered as a field of its own, or
 * `undefined` when no field sits above it.
 *
 * Looked up by key rather than scanned, which is sound only because
 * `registerField` keys every record by `formatObjectPath` of its own path —
 * the same formatting applied to a prefix here.
 *
 * Longest prefix first, because `getFormValues` replays nested fields
 * shallowest-first: where a form registers both `parameters` and
 * `parameters.bounds`, the deeper of the two is the one whose value the
 * assembled output actually shows at a name beneath it.
 */
const findRegisteredAncestorPath = (
  fields: Map<string, FieldState>,
  path: ObjectPath,
): ObjectPath | undefined => {
  for (let length = path.length - 1; length >= 1; length -= 1) {
    const ancestorPath = path.slice(0, length);
    if (fields.has(formatObjectPath(ancestorPath))) return ancestorPath;
  }

  return undefined;
};

/**
 * EVERY strict prefix of `path` registered as a field of its own, nearest
 * first — not just the nearest one, which is all a clear used to reach.
 *
 * Overlapping registrations nest arbitrarily deep: `parameters`,
 * `parameters.bounds`, and `parameters.bounds.min` can all be fields. Dropping
 * a sub-path from only the nearest container leaves every container above it
 * still holding that sub-path, and nothing shows it while the inner fields are
 * mounted, because `getFormValues` replays deeper paths over shallower ones.
 * The stale value surfaces later, when those fields unmount and stop
 * overwriting it.
 */
const collectRegisteredAncestorPaths = (
  fields: Map<string, FieldState>,
  path: ObjectPath,
): ObjectPath[] => {
  const ancestorPaths: ObjectPath[] = [];
  for (let length = path.length - 1; length >= 1; length -= 1) {
    const ancestorPath = path.slice(0, length);
    if (fields.has(formatObjectPath(ancestorPath))) {
      ancestorPaths.push(ancestorPath);
    }
  }

  return ancestorPaths;
};

/** Whether any strict prefix of `path` is registered as a field of its own. */
const hasRegisteredAncestor = (
  fields: Map<string, FieldState>,
  path: ObjectPath,
): boolean => findRegisteredAncestorPath(fields, path) !== undefined;

/**
 * Helper to calculate form validity based on both field states and form-level errors.
 * A form is valid only if all fields are valid AND there are no form-level errors.
 */
const calculateFormValidity = (
  fields: Map<string, FieldState>,
  formErrors: string[],
): boolean => {
  const allFieldsValid = Array.from(fields.values()).every(
    (field) => field.meta.isValid,
  );
  return allFieldsValid && formErrors.length === 0;
};

const syncPublicFields = (
  publicFields: Map<string, FieldState>,
  fieldRecords: Map<string, FieldState>,
): void => {
  const publicNameCounts = new Map<string, number>();
  fieldRecords.forEach((field, fieldName) => {
    const publicName = field.submissionErrorKey ?? fieldName;
    publicNameCounts.set(
      publicName,
      (publicNameCounts.get(publicName) ?? 0) + 1,
    );
  });

  publicFields.clear();
  fieldRecords.forEach((field, fieldName) => {
    const publicName = field.submissionErrorKey ?? fieldName;
    const mapKey =
      publicNameCounts.get(publicName) === 1 ? publicName : fieldName;
    publicFields.set(mapKey, field);
  });
};

const updateFieldMeta = (
  fields: Map<string, FieldState>,
  fieldName: string,
  meta: Partial<FieldState['meta']>,
): FieldState | undefined => {
  const field = fields.get(fieldName);
  if (!field) return undefined;

  const updatedField = {
    ...field,
    meta: { ...field.meta, ...meta },
  };
  fields.set(fieldName, updatedField);
  return updatedField;
};

const clearFieldValidating = (fields: Map<string, FieldState>): void => {
  fields.forEach((field, fieldName) => {
    if (!field.meta.isValidating) return;
    updateFieldMeta(fields, fieldName, { isValidating: false });
  });
};

/**
 * Drop the messages the store is holding about a field, because the value they
 * were written about has just been replaced.
 *
 * An error message is a claim about one specific value. Once a new one is
 * written, the claim cannot be true or false — it is about something that no
 * longer exists — so keeping it on screen tells the researcher to correct a
 * problem they have already corrected. `useField` renders straight from this
 * map, and Architect's Issues panel reads it directly, so a survivor here is a
 * survivor in both.
 *
 * MESSAGES ONLY: `meta.isValid` is deliberately left exactly as it was.
 *
 * Nothing is lost by that, because a message already implies a `false`
 * verdict — `validateField` and `setErrors` are the only two writers of
 * `errors.fieldErrors` and both set `isValid: false` in the same update — so
 * clearing messages can never strand the pair in the "valid, yet complaining"
 * state. And the field keeps whatever verdict it had: still `false` after a
 * failed check, until something looks at the new value.
 *
 * Resetting the verdict here instead would be the single widest-reaching thing
 * this store does. `setFieldValue` is not only a host entry point:
 * `useField.handleChange` calls it on EVERY controlled change, in every
 * fresco-ui form, including the participant-facing ones in `@codaco/interview`.
 * `useField` always builds a validation function, so `!validation` is `false`
 * for every field it registers — a "back to unchecked" reset would therefore
 * mark the field, and through `calculateFormValidity` the whole form, invalid
 * on every keystroke. `SlidesForm` and `EgoForm` gate "ready to continue" on
 * the form flag and `QuickAddField` animates its add badge off the field's,
 * so that shows up on screen as a flicker per character typed.
 *
 * The write also does NOT revalidate. `useField.handleChange` owns rescheduling
 * its own (debounced) validate-on-change, and revalidating here would fight
 * that debounce on every keystroke. The consequence is part of the contract: a
 * write that introduces a NEW problem surfaces at the field's next blur or at
 * submit — `validateForm` runs every field — never between the two.
 */
const discardFieldErrors = (
  state: Pick<FormStoreState, 'errors' | 'isValid'>,
  fieldName: string,
  fields: Map<string, FieldState>,
): void => {
  if (Object.hasOwn(state.errors.fieldErrors, fieldName)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [fieldName]: _removed, ...remainingFieldErrors } =
      state.errors.fieldErrors;
    state.errors = {
      formErrors: state.errors.formErrors,
      fieldErrors: remainingFieldErrors,
    };
  }
  state.isValid = calculateFormValidity(fields, state.errors.formErrors);
};

const normalizeSubmissionErrors = (
  errors: FlattenedErrors,
  fields: Map<string, FieldState>,
): FlattenedErrors => {
  const aliases = new Map<string, string>();
  const ambiguousAliases = new Set<string>();

  fields.forEach((field, fieldName) => {
    if (!field.submissionErrorKey) return;

    if (aliases.has(field.submissionErrorKey)) {
      aliases.delete(field.submissionErrorKey);
      ambiguousAliases.add(field.submissionErrorKey);
      return;
    }

    if (!ambiguousAliases.has(field.submissionErrorKey)) {
      aliases.set(field.submissionErrorKey, fieldName);
    }
  });

  aliases.forEach((fieldName, alias) => {
    if (fields.has(alias) && alias !== fieldName) {
      aliases.delete(alias);
      ambiguousAliases.add(alias);
    }
  });

  const normalizedFieldErrors: FlattenedErrors['fieldErrors'] = {};
  const ambiguousFieldErrors: string[] = [];

  Object.entries(errors.fieldErrors).forEach(([errorKey, messages]) => {
    if (ambiguousAliases.has(errorKey)) {
      ambiguousFieldErrors.push(...(messages ?? []));
      return;
    }

    const alias = aliases.get(errorKey);
    const fieldName = fields.has(errorKey) || !alias ? errorKey : alias;
    const existing = Object.hasOwn(normalizedFieldErrors, fieldName)
      ? normalizedFieldErrors[fieldName]
      : undefined;
    Object.defineProperty(normalizedFieldErrors, fieldName, {
      configurable: true,
      enumerable: true,
      value: existing && messages ? [...existing, ...messages] : messages,
      writable: true,
    });
  });

  return {
    formErrors: [...errors.formErrors, ...ambiguousFieldErrors],
    fieldErrors: normalizedFieldErrors,
  };
};

/**
 * The fields with a validation in flight, other than `exclude`.
 *
 * Every authoritative state transition invalidates all in-flight validations,
 * because a field's schema may depend on any value in the form. Invalidation
 * silently DISCARDS those results, and nothing else reschedules them, so the
 * field keeps whatever error it held before its validation started —
 * indefinitely, until something else validates it. Callers must therefore
 * revalidate the fields returned here against the new snapshot.
 *
 * `exclude` is the field the transition is about: its own component owns
 * rescheduling its (possibly debounced) validation.
 */
const collectSupersededFields = (
  fields: Map<string, FieldState>,
  exclude?: string,
): ObjectPath[] => {
  const superseded: ObjectPath[] = [];
  fields.forEach((field, name) => {
    if (name !== exclude && field.meta.isValidating) {
      superseded.push(resolveStoredFieldPath(name, field));
    }
  });
  return superseded;
};

type InternalFieldConfig = Omit<FieldConfig, 'name'> & {
  name: ObjectPath;
};

type UnregisterFieldOptions = {
  /**
   * Keep the current value available for a later registration by default.
   * When false, a cleared tombstone is retained so a later registration does
   * not restore its initial value and form hosts can distinguish a deliberate
   * discard from a field that was never mounted.
   */
  preserveValue?: boolean;
};

type FieldOperations<Reference, Config> = {
  registerField: (config: Config) => void;
  unregisterField: (
    fieldName: Reference,
    options?: UnregisterFieldOptions,
  ) => void;
  setFieldValue: (fieldName: Reference, value: FieldValue) => void;
  setFieldTouched: (fieldName: Reference, touched: boolean) => void;
  setFieldBlurred: (fieldName: Reference) => void;
  getFieldState: (fieldName: Reference) => FieldState | undefined;
  getFieldErrors: (fieldName: Reference) => string[] | null;
  validateField: (fieldName: Reference) => Promise<void>;
  resetField: (fieldName: Reference) => void;
  getValue: (fieldName: Reference) => FieldValue;
  hasValue: (fieldName: Reference) => boolean;
  clearValue: (fieldName: Reference) => void;
};

type FieldPathOperations = FieldOperations<ObjectPath, InternalFieldConfig>;

type FormStoreState = {
  /** Public field map keyed by the names supplied by field consumers. */
  fields: Map<string, FieldState>;
  dormantValues: Map<string, FieldState>;
  /** Increments when a configured field is deliberately discarded on unmount. */
  fieldDiscardVersion: number;
  /** Increments when a host restores an earlier form snapshot. */
  formRestoreVersion: number;
  errors: FlattenedErrors;
  isSubmitting: boolean;
  isValidating: boolean;
  isDirty: boolean;
  isValid: boolean;
  submitHandler: FormSubmitHandler | null;
  submitInvalidHandler: ((errors: FlattenedErrors) => void) | null;
  /**
   * Ticks once per blocked submission attempt. `useForm` watches it from a
   * LAYOUT effect, so the invalid-submit handler runs after React has
   * committed the render that shows the errors — the only point at which the
   * first invalid control is both in the DOM and safe from the commit's own
   * focus restoration. Hosts that validate outside the form element (the
   * interview's Next button) tick it instead of scheduling their own timer,
   * so every host orders focus against the commit the same way.
   */
  errorFocusRequest: number;

  // Form management
  registerForm: (config: FormConfig) => void;
  notifyRestore: () => void;
  reset: () => void;

  setErrors: (errors: FlattenedErrors | null) => void;
  requestErrorFocus: () => void;

  // Getters with selective subscription
  getFormValues: () => Record<string, FieldValue>;
  getFormErrors: () => string[] | null;

  // Validation
  validateForm: () => Promise<boolean>;

  // Form submission
  setSubmitting: (submitting: boolean) => void;
  submitForm: () => Promise<void>;

  // Form reset
  resetForm: () => void;
};

/**
 * Values that mean "nothing here". A field registered without an
 * `initialValue` holds `undefined`; typing into it and then clearing it leaves
 * `''` (or `[]`). Those are the same state to the person editing, so treating
 * them as different would report a form dirty after an edit was undone.
 */
const isBlankFieldValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const hasFieldChanged = (field: FieldState): boolean => {
  if (isBlankFieldValue(field.value) && isBlankFieldValue(field.initialValue)) {
    return false;
  }
  return !isEqual(field.value, field.initialValue);
};

/**
 * Whether the form currently holds values that differ from the ones its fields
 * registered with.
 *
 * A LIVE comparison, and deliberately not the `isDirty` flag beside it in this
 * same state. That flag is sticky — `setFieldValue` sets it and only `reset`
 * clears it — so it never returns to false once anything has been typed.
 * Anything guarding unsaved work on the sticky flag nags about a form the
 * person had already restored by hand, and any normalisation write at mount (a
 * markdown-to-rich-text conversion, an editor seeding itself) makes a freshly
 * opened form claim to be dirty immediately.
 *
 * `dormantValues` counts: a field that unmounts through the default lifecycle
 * parks its value there, and an edit made before it unmounted is still an
 * unsaved edit. A destructive unmount parks `undefined` instead, which is also
 * a real change when the field originally held data.
 *
 * Lives here, next to the state it reads, because more than one host needs the
 * answer and a host-local copy freezes that host's idea of "blank" — Architect
 * carried one for its nested-editor discard guard.
 */
export const selectIsFormDirty = (
  state: Pick<FormStoreState, 'fields' | 'dormantValues'>,
): boolean => {
  for (const field of state.fields.values()) {
    if (hasFieldChanged(field)) return true;
  }
  for (const field of state.dormantValues.values()) {
    if (hasFieldChanged(field)) return true;
  }
  return false;
};

export type FormStore = FormStoreState &
  FieldOperations<string, FieldConfig> & {
    pathOperations?: FieldPathOperations;
  };

export type FormStoreApi = Mutate<
  StoreApi<FormStore>,
  [['zustand/immer', never]]
>;

export const createFormStore = (): FormStoreApi => {
  // Validation tokens are unique by identity, so resetting the form can never
  // make an old request current again (an ABA race). Authoritative state
  // transitions clear all field tokens because a field schema may depend on
  // any value in the form.
  const fieldValidationTokens = new Map<string, symbol>();
  let formValidationToken = Symbol('form-validation');
  const fieldRecords = new Map<string, FieldState>();
  const dormantRecords = new Map<string, FieldState>();
  // The last container value handed out per container name, so `getValue` can
  // keep returning it by identity while it stays deep-equal. See `getValue`.
  const containerValues = new Map<string, FieldValue>();

  const invalidateFormValidation = () => {
    formValidationToken = Symbol('form-validation');
  };

  const invalidateAllValidations = () => {
    fieldValidationTokens.clear();
    invalidateFormValidation();
  };

  const beginFieldValidation = (fieldName: string) => {
    invalidateFormValidation();
    const token = Symbol(`field-validation:${fieldName}`);
    fieldValidationTokens.set(fieldName, token);
    return token;
  };

  const beginFormValidation = () => {
    // A form validation supersedes every field validation over the previous
    // snapshot. Field validation is skipped while this token is active;
    // authoritative state transitions invalidate it instead.
    fieldValidationTokens.clear();
    const token = Symbol('form-validation');
    formValidationToken = token;
    return token;
  };

  return createStore<FormStore>()(
    immer((set, get, _store) => ({
      fields: new Map(),
      dormantValues: new Map(),
      fieldDiscardVersion: 0,
      formRestoreVersion: 0,
      errors: { formErrors: [], fieldErrors: {} },

      isSubmitting: false,
      isValidating: false,
      isDirty: false,
      isValid: true,
      errorFocusRequest: 0,

      submitHandler: null,
      submitInvalidHandler: null,

      pathOperations: {
        registerField: (config) =>
          get().registerField({
            ...config,
            name: encodeObjectPath(config.name),
          }),
        unregisterField: (fieldName, options) =>
          get().unregisterField(encodeObjectPath(fieldName), options),
        setFieldValue: (fieldName, value) =>
          get().setFieldValue(encodeObjectPath(fieldName), value),
        setFieldTouched: (fieldName, touched) =>
          get().setFieldTouched(encodeObjectPath(fieldName), touched),
        setFieldBlurred: (fieldName) =>
          get().setFieldBlurred(encodeObjectPath(fieldName)),
        getFieldState: (fieldName) =>
          get().getFieldState(encodeObjectPath(fieldName)),
        getFieldErrors: (fieldName) =>
          get().getFieldErrors(encodeObjectPath(fieldName)),
        validateField: (fieldName) =>
          get().validateField(encodeObjectPath(fieldName)),
        resetField: (fieldName) =>
          get().resetField(encodeObjectPath(fieldName)),
        getValue: (fieldName) => get().getValue(encodeObjectPath(fieldName)),
        hasValue: (fieldName) => get().hasValue(encodeObjectPath(fieldName)),
        clearValue: (fieldName) =>
          get().clearValue(encodeObjectPath(fieldName)),
      },

      registerForm: (config) => {
        set((state) => {
          state.submitHandler = config.onSubmit;
          state.submitInvalidHandler = config.onSubmitInvalid ?? null;
        });
      },

      notifyRestore: () => {
        set((state) => {
          state.formRestoreVersion += 1;
        });
      },

      reset: () => {
        invalidateAllValidations();
        fieldRecords.clear();
        dormantRecords.clear();
        containerValues.clear();
        set((state) => {
          state.fields.clear();
          state.dormantValues.clear();
          state.errors = { formErrors: [], fieldErrors: {} };
          state.isSubmitting = false;
          state.isValidating = false;
          state.isDirty = false;
          state.isValid = true;
          state.submitHandler = null;
          state.submitInvalidHandler = null;
          // Deliberately monotonic: rewinding the counter here would read as a
          // fresh request to the watching layout effect and focus a field the
          // person never tried to submit.
        });
      },

      requestErrorFocus: () => {
        set((state) => {
          state.errorFocusRequest += 1;
        });
      },

      registerField: (config) => {
        const fieldPath = resolveFieldPath(config.name);
        const fieldName = formatObjectPath(fieldPath);
        const publicFieldName = config.name.startsWith(internalPathPrefix)
          ? (config.submissionErrorKey ?? fieldName)
          : config.name;
        // Mounting a field is an authoritative transition — it adds a value to
        // the snapshot every other field's schema can see — so it invalidates
        // every in-flight validation. Reschedule the ones belonging to OTHER
        // fields; without this, a field whose validation was in flight silently
        // keeps its previous error.
        //
        // A section gated on another field's value is exactly this case: the
        // gate field's post-change revalidation is dropped by the very mount
        // that change caused, so its now-stale "required" error survives until
        // the field is blurred again.
        const supersededFields = collectSupersededFields(
          fieldRecords,
          fieldName,
        );
        invalidateAllValidations();
        set((state) => {
          state.isValidating = false;
          clearFieldValidating(fieldRecords);

          const dormant = dormantRecords.get(fieldName);
          const hasDormantValue = dormant !== undefined;
          const value = hasDormantValue ? dormant.value : config.initialValue;
          const standingErrors = Object.hasOwn(
            state.errors.fieldErrors,
            fieldName,
          )
            ? state.errors.fieldErrors[fieldName]
            : undefined;
          const hasStandingErrors =
            Array.isArray(standingErrors) && standingErrors.length > 0;

          if (hasDormantValue) {
            dormantRecords.delete(fieldName);
          }

          const fieldState: FieldState = {
            path: dormant?.path ?? fieldPath,
            submissionErrorKey:
              dormant?.submissionErrorKey ??
              config.submissionErrorKey ??
              (publicFieldName === fieldName ? undefined : publicFieldName),
            initialValue: config.initialValue,
            validation: config.validation,
            value,
            meta: {
              isValidating: false,
              isTouched: hasDormantValue || hasStandingErrors,
              isBlurred: hasStandingErrors,
              isDirty: hasDormantValue || hasStandingErrors,
              isValid: hasStandingErrors ? false : !config.validation,
            },
          };

          fieldRecords.set(fieldName, fieldState);
          syncPublicFields(state.fields, fieldRecords);
          syncPublicFields(state.dormantValues, dormantRecords);

          state.isValid = calculateFormValidity(
            fieldRecords,
            state.errors.formErrors,
          );
        });

        supersededFields.forEach((name) => {
          void get().pathOperations?.validateField(name);
        });
      },

      unregisterField: (fieldReference, options) => {
        // Check if field exists before updating to avoid unnecessary renders
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          fieldReference,
        );
        if (fieldRecords.has(fieldName)) {
          // Unmounting removes a value from the snapshot, so it invalidates
          // every in-flight validation for the same reason `registerField`
          // does — and the surviving fields' validations must be rescheduled.
          const supersededFields = collectSupersededFields(
            fieldRecords,
            fieldName,
          );
          invalidateAllValidations();
          set((state) => {
            state.isValidating = false;
            clearFieldValidating(fieldRecords);

            const field = fieldRecords.get(fieldName);
            if (field) {
              if (
                options?.preserveValue === false &&
                field.value !== undefined
              ) {
                state.fieldDiscardVersion += 1;
              }
              dormantRecords.set(fieldName, {
                path: resolveStoredFieldPath(fieldName, field),
                submissionErrorKey: field.submissionErrorKey,
                initialValue: field.initialValue,
                validation: field.validation,
                value:
                  options?.preserveValue === false ? undefined : field.value,
                meta: {
                  isValidating: false,
                  isTouched: true,
                  isBlurred: true,
                  isDirty: true,
                  isValid:
                    options?.preserveValue === false
                      ? !field.validation
                      : field.meta.isValid,
                },
              });
            } else {
              dormantRecords.delete(fieldName);
            }

            fieldRecords.delete(fieldName);
            syncPublicFields(state.fields, fieldRecords);
            syncPublicFields(state.dormantValues, dormantRecords);

            // Clean up any errors for this field
            if (Object.hasOwn(state.errors.fieldErrors, fieldName)) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [fieldName]: _removed, ...remainingFieldErrors } =
                state.errors.fieldErrors;
              state.errors = {
                formErrors: state.errors.formErrors,
                fieldErrors: remainingFieldErrors,
              };
            }

            // Recalculate form validity
            state.isValid = calculateFormValidity(
              fieldRecords,
              state.errors.formErrors,
            );
          });

          supersededFields.forEach((name) => {
            void get().pathOperations?.validateField(name);
          });
        }
      },

      setErrors: (errors) => {
        invalidateAllValidations();

        if (errors === null) {
          set((state) => {
            state.isValidating = false;
            clearFieldValidating(fieldRecords);

            // setErrors marks fields named by server errors invalid. Clearing
            // those errors after a successful submission must also clear that
            // server-owned invalid state; fields without client validation are
            // otherwise never revalidated and can leave the form invalid.
            Object.keys(state.errors.fieldErrors).forEach((fieldName) => {
              updateFieldMeta(fieldRecords, fieldName, { isValid: true });
            });
            state.errors = { formErrors: [], fieldErrors: {} };
            state.isValid = calculateFormValidity(fieldRecords, []);
            syncPublicFields(state.fields, fieldRecords);
          });
          return;
        }

        const normalizedErrors = normalizeSubmissionErrors(
          errors,
          fieldRecords,
        );

        set((state) => {
          state.isValidating = false;
          clearFieldValidating(fieldRecords);

          state.errors = normalizedErrors;
          Object.entries(normalizedErrors.fieldErrors).forEach(
            ([fieldName, fieldErrors]) => {
              if (!fieldErrors || fieldErrors.length === 0) return;
              updateFieldMeta(fieldRecords, fieldName, {
                isValid: false,
                isTouched: true,
                isBlurred: true,
                isDirty: true,
              });
            },
          );
          state.isValid = calculateFormValidity(
            fieldRecords,
            normalizedErrors.formErrors,
          );
          syncPublicFields(state.fields, fieldRecords);
        });
      },

      setFieldValue: (fieldReference, value) => {
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          fieldReference,
        );
        const existingField =
          fieldRecords.get(fieldName) ?? dormantRecords.get(fieldName);
        const fieldPath = existingField
          ? resolveStoredFieldPath(fieldName, existingField)
          : resolveFieldPath(fieldReference);
        if (!fieldRecords.has(fieldName)) {
          // A host may stage a value for a field that is not currently
          // mounted (Architect's undo/redo). The write is parked in dormant
          // storage for the field's next registration: it is not validated,
          // owns no errors, and stays out of the form's output until then.
          set((state) => {
            const existing = dormantRecords.get(fieldName);
            dormantRecords.set(fieldName, {
              path: existing?.path ?? fieldPath,
              submissionErrorKey: existing?.submissionErrorKey,
              initialValue: existing?.initialValue,
              validation: existing?.validation,
              value,
              meta: {
                isValidating: false,
                isTouched: true,
                isBlurred: true,
                isDirty: true,
                isValid: existing?.meta.isValid ?? true,
              },
            });
            // A field can hold errors from a submit and then be unmounted (a
            // collapsed section) before a host stages a new value for it. The
            // messages outlive the mount, and Architect's Issues panel reads
            // this map directly, so a row for a value that no longer exists
            // would survive with nothing on screen to correct.
            discardFieldErrors(state, fieldName, fieldRecords);
            state.isDirty = true;
            syncPublicFields(state.dormantValues, dormantRecords);
          });
          return;
        }

        // Capture the sibling fields whose in-flight validation the write
        // below invalidates, so they can be revalidated against the new
        // values. The changed field itself is excluded: its component owns
        // rescheduling its (debounced) validate-on-change.
        const supersededFields = collectSupersededFields(
          fieldRecords,
          fieldName,
        );

        invalidateAllValidations();
        set((state) => {
          state.isValidating = false;
          clearFieldValidating(fieldRecords);

          const field = fieldRecords.get(fieldName);
          if (!field) return;
          fieldRecords.set(fieldName, {
            ...field,
            value,
            meta: {
              ...field.meta,
              isDirty: true,
              isTouched: true,
            },
          });
          discardFieldErrors(state, fieldName, fieldRecords);
          state.isDirty = true;
          syncPublicFields(state.fields, fieldRecords);
        });

        supersededFields.forEach((name) => {
          void get().pathOperations?.validateField(name);
        });
      },

      setFieldTouched: (field, touched) => {
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          field,
        );
        set((state) => {
          const fieldState = updateFieldMeta(fieldRecords, fieldName, {
            isTouched: touched,
          });
          if (!fieldState) return;
          syncPublicFields(state.fields, fieldRecords);
        });
      },

      setFieldBlurred: (field) => {
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          field,
        );
        set((state) => {
          const fieldState = updateFieldMeta(fieldRecords, fieldName, {
            isBlurred: true,
          });
          if (!fieldState) return;
          syncPublicFields(state.fields, fieldRecords);
        });
      },

      getFieldState: (field) => {
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          field,
        );
        return (
          fieldRecords.get(fieldName) ??
          dormantRecords.get(fieldName) ??
          undefined
        );
      },

      /**
       * The value at `fieldName`, from whichever of three places the form
       * holds it: a field of its own, leaves registered BENEATH it, or a
       * compound field registered at an ANCESTOR of it.
       *
       * The field maps are exact-string-keyed and carry no hierarchy, so the
       * name a value is readable at and the name it is registered under come
       * apart in both directions. A form that registers `parameters.type` and
       * `parameters.min` never registers `parameters` at all; a form that
       * registers `parameters` whole never registers `parameters.type`. Both
       * names are nonetheless there in the form's own output, so a read that
       * stopped at the exact key would report `undefined` for a value every
       * other consumer can see — and a caller layering live values over
       * committed ones would take that as "not in the form" and revive the
       * committed one. A name with no field of its own therefore falls through
       * to the assembled output whenever a registered field sits beneath it or
       * above it. It is the whole-form assembly and not just the subtree,
       * because both directions resolve against the same object. A field
       * registered AT the name is still read as itself, on the terms every
       * other value read uses — that is the value its own control is showing.
       *
       * The result is returned by IDENTITY while it stays deep-equal to the
       * last one handed out, because `getFormValues` builds a fresh object
       * every call: without that, a component selecting a container would
       * re-render on every unrelated keystroke in the form, and any effect
       * depending on the value would loop. Exact-name reads never reach any of
       * this.
       *
       * REGISTERED fields above or below outrank a dormant field sitting at
       * the name itself, because `getFormValues` is built from registered
       * fields alone. `clearValue` is what makes that ordering load-bearing:
       * clearing a container parks a dormant `undefined` at its name, and
       * taking that ahead of the leaves would leave every later read of the
       * container answering `undefined` — permanently, since nothing registers
       * at a container name to displace it.
       *
       * DORMANT ancestors are excluded for the same reason dormant leaves are:
       * an unmounted field contributes nothing to `getFormValues`, so there is
       * no assembled object to read a sub-path out of.
       */
      getValue: (fieldReference) => {
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          fieldReference,
        );
        const registered = fieldRecords.get(fieldName);
        if (registered) return registered.value;

        const containerPath = parseFieldReference(fieldReference);
        if (
          containerPath &&
          (hasDescendantField(fieldRecords, containerPath) ||
            hasRegisteredAncestor(fieldRecords, containerPath))
        ) {
          // `getFormValues` assembles its output out of `FieldValue` leaves,
          // so every node within it is itself a `FieldValue`.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const assembled = readObjectPath(
            get().getFormValues(),
            containerPath,
          ) as FieldValue;
          const containerName = formatObjectPath(containerPath);

          if (containerValues.has(containerName)) {
            const previous = containerValues.get(containerName);
            if (isEqual(previous, assembled)) return previous;
          }

          containerValues.set(containerName, assembled);
          return assembled;
        }

        // Dormant leaves contribute nothing to `getFormValues`, so a container
        // held only by them assembles to nothing at all.
        return dormantRecords.get(fieldName)?.value;
      },

      /**
       * Whether the form holds anything at `fieldName` — a registered field, a
       * dormant one, leaves registered beneath it, or a registered field above
       * it that owns the subtree the name sits in.
       *
       * Separate from `getValue` because a value read collapses "the form owns
       * nothing here" and "the form owns `undefined` here" into the same
       * answer, and a caller merging live values over committed ones has to
       * tell those apart: before the leaves of a container register, the
       * committed value is the only one there is. A registered ANCESTOR
       * answers `true` whatever the assembled sub-path currently reads as —
       * the form owns that subtree, so a sub-path missing from it is a value
       * the person has emptied, not one the form has yet to hold.
       *
       * DORMANT ancestors are excluded, matching `getValue`: an unmounted
       * field is not part of the form's output, so it owns no subtree here.
       */
      hasValue: (fieldReference) => {
        if (get().getFieldState(fieldReference) !== undefined) return true;

        const containerPath = parseFieldReference(fieldReference);
        if (!containerPath) return false;

        return (
          hasDescendantField(fieldRecords, containerPath) ||
          hasDescendantField(dormantRecords, containerPath) ||
          hasRegisteredAncestor(fieldRecords, containerPath)
        );
      },

      /**
       * Clear `fieldName` everywhere the form holds it — the same three places
       * `getValue` reads it from, resolved in the same order: a field of its
       * own, the leaves registered BENEATH it, and the compound field
       * registered at an ANCESTOR of it.
       *
       * The name resolves to a FIELD before it is read structurally, exactly
       * as every other operation on this store resolves one. An opaque name is
       * a single segment that happens to contain a dot (`favorite.color`, what
       * `Field nameMode="opaque"` registers and publishes), so interpreting it
       * structurally parks an `undefined` at a nested name nothing is
       * registered under and leaves the field it actually names holding its
       * value — readable through the alias, and still submitted.
       *
       * `setFieldValue(name, undefined)` clears nothing when the value is held
       * as a tree of leaves rather than as one field, and DORMANT descendants
       * have to go too: an unmounted field's parked value outranks
       * `initialValue` when it next registers, so a leaf left behind here comes
       * straight back the moment anything re-registers it.
       *
       * A name a registered ANCESTOR supplies is cleared INSIDE that
       * ancestor's value — a fresh copy of it with the sub-path dropped,
       * written through `setFieldValue` like any other value, so subscribers
       * and dirty tracking see it as the change it is. Parking an `undefined`
       * at the name alone would clear nothing at all, because the read takes
       * the registered ancestor over a dormant field sitting at the name. An
       * ancestor holding nothing at the sub-path — a string where the name
       * expects an object, a key it never carried — is left exactly as it is
       * rather than rebuilt around a value it never had.
       *
       * A REGISTERED field at the name gets this same ancestor write, not just
       * its own value cleared: while it stays mounted, `getFormValues` replays
       * it OVER its ancestor, so the ancestor's stale value is invisible either
       * way. But the leaf can unmount later — a conditional field whose
       * governing value just changed, which is exactly when clearing one
       * matters — and an unmounted field contributes nothing to
       * `getFormValues`. Skipping the ancestor write here would leave its
       * stale sub-path to resurface the moment the leaf goes dormant, silently
       * reviving data the person just cleared.
       */
      clearValue: (fieldReference) => {
        const pathOperations = get().pathOperations;
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          fieldReference,
        );
        const existingField =
          fieldRecords.get(fieldName) ?? dormantRecords.get(fieldName);
        // A field of its own answers for its own name, whatever that name
        // reads like structurally.
        const containerPath = existingField
          ? resolveStoredFieldPath(fieldName, existingField)
          : parseFieldReference(fieldReference);

        if (!containerPath || !pathOperations) {
          get().setFieldValue(fieldReference, undefined);
          return;
        }

        // A path can only be registered or dormant, never both, so the two
        // passes cannot name the same field twice.
        const descendants = [
          ...collectDescendantPaths(fieldRecords, containerPath),
          ...collectDescendantPaths(dormantRecords, containerPath),
        ];
        const ancestorPaths = collectRegisteredAncestorPaths(
          fieldRecords,
          containerPath,
        );

        get().setFieldValue(fieldReference, undefined);
        descendants.forEach((path) => {
          pathOperations.setFieldValue(path, undefined);
        });

        ancestorPaths.forEach((ancestorPath) => {
          const ancestor = fieldRecords.get(formatObjectPath(ancestorPath));
          if (!ancestor) return;

          // A copy of a `FieldValue` with one sub-path dropped out of it is
          // itself a `FieldValue`: `omitValue` only ever removes a key from a
          // container it has already copied.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const clearedAncestorValue = omitValue(
            ancestor.value,
            containerPath.slice(ancestorPath.length),
          ) as FieldValue;
          // Identity is `omitValue`'s report that the value held nothing at
          // the sub-path. Writing anyway would mark a field dirty over a value
          // the person never had.
          if (clearedAncestorValue === ancestor.value) return;

          pathOperations.setFieldValue(ancestorPath, clearedAncestorValue);
        });
      },

      getFormValues: () => {
        const values: Record<string, FieldValue> = {};
        const writeValue = createObjectPathWriter(values);
        // Only registered fields contribute: an unmounted field's value is
        // not part of the form's output. Dormant storage exists solely to
        // restore a value when the field remounts and to back the
        // getFieldState fallback for cross-step reads.
        //
        // Registration order, which is also the output's key order.
        fieldRecords.forEach((fieldState, fieldName) => {
          writeValue(
            resolveStoredFieldPath(fieldName, fieldState),
            fieldState.value,
          );
        });

        // A form may register a field at a CONTAINER path (`mapOptions`)
        // *and* fields at leaves inside it (`mapOptions.style`). `setValue`
        // replaces whatever sits at a path, so the pass above lets whichever
        // of the two happened to mount last silently erase the other. Replay
        // just those nested fields, shallowest first, so the more specific
        // field always wins — and only they, so a form without overlapping
        // paths keeps byte-identical output.
        const nested = Array.from(fieldRecords.entries())
          .filter(([fieldName, fieldState]) =>
            hasRegisteredAncestor(
              fieldRecords,
              resolveStoredFieldPath(fieldName, fieldState),
            ),
          )
          .toSorted(
            ([aName, a], [bName, b]) =>
              resolveStoredFieldPath(aName, a).length -
              resolveStoredFieldPath(bName, b).length,
          );

        for (const [fieldName, fieldState] of nested) {
          writeValue(
            resolveStoredFieldPath(fieldName, fieldState),
            fieldState.value,
          );
        }

        return values;
      },

      getFormErrors: () => {
        const state = get();
        if (!state.errors) return null;

        // Return form-level errors from flattened structure
        const formErrors = state.errors.formErrors;
        return formErrors.length > 0 ? formErrors : null;
      },

      getFieldErrors: (field) => {
        const state = get();
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          field,
        );
        if (!state.errors) return null;

        // Return field errors from flattened structure
        // Return null if no errors or empty array (consistent API)
        const fieldErrors = Object.hasOwn(state.errors.fieldErrors, fieldName)
          ? state.errors.fieldErrors[fieldName]
          : undefined;
        return fieldErrors && fieldErrors.length > 0 ? fieldErrors : null;
      },
      validateField: async (fieldReference) => {
        const state = get();
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          fieldReference,
        );
        const field = fieldRecords.get(fieldName);
        // Whole-form validation owns the current snapshot. A delayed
        // validate-on-change callback is redundant and must not cancel a
        // submission that is already validating the same values.
        if (!field?.validation || state.isValidating) return;
        const validationToken = beginFieldValidation(fieldName);
        const isCurrentValidation = () =>
          fieldValidationTokens.get(fieldName) === validationToken;

        set((draft) => {
          const form = draft;
          form.isValidating = false;
          const currentField = updateFieldMeta(fieldRecords, fieldName, {
            isValidating: true,
          });
          if (currentField) {
            syncPublicFields(form.fields, fieldRecords);
          }
        });

        try {
          const result = await validateFieldValue(
            field.value,
            field.validation,
            state.getFormValues(),
          );

          if (!isCurrentValidation()) return;

          if (!result.success) {
            set((draft) => {
              const form = draft;
              const draftField = updateFieldMeta(fieldRecords, fieldName, {
                isValidating: false,
                isValid: false,
              });
              if (draftField) {
                const prevFormErrors = form.errors ?? {
                  formErrors: [],
                  fieldErrors: {},
                };

                form.errors = {
                  formErrors: prevFormErrors.formErrors,
                  fieldErrors: {
                    ...prevFormErrors.fieldErrors,
                    [fieldName]: result.error.issues.map(
                      (issue) => issue.message,
                    ),
                  },
                };

                // Update form-level isValid (considers both field and form-level errors)
                form.isValid = calculateFormValidity(
                  fieldRecords,
                  form.errors.formErrors,
                );
                syncPublicFields(form.fields, fieldRecords);
              }
            });
          } else {
            set((draft) => {
              const form = draft;
              const currentField = updateFieldMeta(fieldRecords, fieldName, {
                isValidating: false,
                isValid: true,
              });
              if (currentField) {
                // Remove errors for this field when validation succeeds
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { [fieldName]: _removed, ...remainingFieldErrors } =
                  form.errors.fieldErrors;
                form.errors = {
                  formErrors: form.errors.formErrors,
                  fieldErrors: remainingFieldErrors,
                };

                // Update form-level isValid (considers both field and form-level errors)
                form.isValid = calculateFormValidity(
                  fieldRecords,
                  form.errors.formErrors,
                );
                syncPublicFields(form.fields, fieldRecords);
              }
            });
          }
        } catch {
          if (!isCurrentValidation()) return;
          set((draft) => {
            const form = draft;
            const currentField = updateFieldMeta(fieldRecords, fieldName, {
              isValid: false,
              isValidating: false,
            });
            if (currentField) {
              // Add error to the unified error store
              form.errors = {
                formErrors: form.errors.formErrors,
                fieldErrors: {
                  ...form.errors.fieldErrors,
                  [fieldName]: ['Something went wrong during validation'],
                },
              };

              // Update form-level isValid (considers both field and form-level errors)
              form.isValid = calculateFormValidity(
                fieldRecords,
                form.errors.formErrors,
              );
              syncPublicFields(form.fields, fieldRecords);
            }
          });
        }
      },

      validateForm: async () => {
        const state = get();
        const fields = fieldRecords;
        const formValues = state.getFormValues();
        const validationToken = beginFormValidation();
        const isCurrentValidation = () =>
          formValidationToken === validationToken;
        const fieldErrors: Record<string, string[]> = {};

        set((draft) => {
          draft.isValidating = true;
          clearFieldValidating(fieldRecords);
          syncPublicFields(draft.fields, fieldRecords);
        });

        // Collect field meta updates to apply in a single batch
        const fieldMetaUpdates = new Map<
          string,
          { isValid: boolean; markAsTouched?: boolean }
        >();

        // First validate all fields
        const fieldValidationPromises = Array.from(fields.entries()).map(
          async ([fieldName, fieldState]) => {
            if (!fieldState?.validation) return { fieldName, success: true };

            const result = await validateFieldValue(
              fieldState.value,
              fieldState.validation,
              formValues,
            );

            return { fieldName, result };
          },
        );
        type FieldValidationResult = Awaited<
          (typeof fieldValidationPromises)[number]
        >;
        let fieldResults: FieldValidationResult[];

        try {
          fieldResults = await Promise.all(fieldValidationPromises);
        } catch (error) {
          if (!isCurrentValidation()) return false;
          set((draft) => {
            draft.isValidating = false;
          });
          throw error;
        }

        if (!isCurrentValidation()) return false;

        // Process validation results and collect errors and meta updates
        fieldResults.forEach(({ fieldName, result }) => {
          if (!result) {
            // A field without client validation is intrinsically valid at this
            // stage. This also clears any invalid flag previously owned by a
            // server response before a subsequent successful submission.
            fieldMetaUpdates.set(fieldName, { isValid: true });
          } else if (!result.success) {
            // Each result is already scoped to one registered field. Preserve
            // every issue regardless of its nested object/array path.
            const combinedErrors = result.error.issues.map(
              (issue) => issue.message,
            );

            if (combinedErrors.length > 0) {
              Object.defineProperty(fieldErrors, fieldName, {
                configurable: true,
                enumerable: true,
                value: combinedErrors,
                writable: true,
              });
            }

            // Mark for update: touched, blurred, dirty, and invalid
            fieldMetaUpdates.set(fieldName, {
              isValid: false,
              markAsTouched: true,
            });
          } else {
            // Field is valid
            fieldMetaUpdates.set(fieldName, { isValid: true });
          }
        });

        // Apply all updates in a single batch
        set((draft) => {
          draft.isValidating = false;

          // Apply field meta updates
          fieldMetaUpdates.forEach(({ isValid, markAsTouched }, fieldName) => {
            updateFieldMeta(fieldRecords, fieldName, {
              isValid,
              ...(markAsTouched
                ? {
                    isTouched: true,
                    isBlurred: true,
                    isDirty: true,
                  }
                : {}),
            });
          });

          // Update the unified error store, preserving any existing form-level errors
          const existingFormErrors = draft.errors.formErrors;

          if (Object.keys(fieldErrors).length > 0) {
            draft.errors = {
              formErrors: existingFormErrors,
              fieldErrors,
            };
            draft.isValid = false;
          } else {
            draft.errors = {
              formErrors: existingFormErrors,
              fieldErrors: {},
            };
            // Only mark as valid if there are no form-level errors either
            draft.isValid = existingFormErrors.length === 0;
          }
          syncPublicFields(draft.fields, fieldRecords);
        });

        return Object.keys(fieldErrors).length === 0;
      },

      setSubmitting: (submitting) => {
        set((state) => {
          const form = state;
          if (!form) return;

          form.isSubmitting = submitting;
        });
      },

      submitForm: async () => {
        const state = get();

        if (!state.submitHandler) {
          // eslint-disable-next-line no-console
          console.warn('No submit handler registered');
          return;
        }

        const values = state.getFormValues();
        await state.submitHandler(values);
      },

      resetForm: () => {
        invalidateAllValidations();
        set((state) => {
          // Reset all fields to their initial values (inline to avoid nested set calls)
          fieldRecords.forEach((fieldState, fieldName) => {
            fieldRecords.set(fieldName, {
              ...fieldState,
              value: fieldState.initialValue,
              meta: {
                isValidating: false,
                isTouched: false,
                isBlurred: false,
                isDirty: false,
                // Fields without validation are valid by default
                isValid: !fieldState.validation,
              },
            });
          });

          // Reset form-level state
          state.errors = { formErrors: [], fieldErrors: {} };
          state.isSubmitting = false;
          state.isValidating = false;
          state.isDirty = false;
          syncPublicFields(state.fields, fieldRecords);
          state.isValid = calculateFormValidity(fieldRecords, []);
        });
      },

      resetField: (fieldReference) => {
        const fieldName = resolveRegisteredFieldName(
          fieldRecords,
          dormantRecords,
          fieldReference,
        );
        if (!fieldRecords.has(fieldName)) return;

        invalidateAllValidations();
        set((state) => {
          state.isValidating = false;
          clearFieldValidating(fieldRecords);

          const fieldConfig = fieldRecords.get(fieldName);
          if (!fieldConfig) return;

          const initialValue = fieldConfig.initialValue;

          fieldRecords.set(fieldName, {
            ...fieldConfig,
            value: initialValue,
            meta: {
              isValidating: false,
              isTouched: false,
              isBlurred: false,
              isDirty: false,
              // Fields without validation are valid by default
              isValid: !fieldConfig.validation,
            },
          });
          syncPublicFields(state.fields, fieldRecords);

          // Remove errors for this field from the unified error store
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [fieldName]: _removed, ...remainingFieldErrors } =
            state.errors.fieldErrors;

          state.errors = {
            formErrors: state.errors.formErrors,
            fieldErrors: remainingFieldErrors,
          };

          // Update form-level isValid (considers both field and form-level errors)
          state.isValid = calculateFormValidity(
            fieldRecords,
            state.errors.formErrors,
          );
        });
      },
    })),
  );
};
