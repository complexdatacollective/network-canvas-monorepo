import { enableMapSet } from 'immer';
import { immer } from 'zustand/middleware/immer';
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla';

import type { FieldValue } from '../Field/types';
import { setValue } from '../utils/objectPath';
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

export type FormStore = {
  fields: Map<string, FieldState>;
  dormantValues: Map<string, FieldState>;
  errors: FlattenedErrors;
  isSubmitting: boolean;
  isValidating: boolean;
  isDirty: boolean;
  isValid: boolean;
  submitHandler: FormSubmitHandler | null;
  submitInvalidHandler: ((errors: FlattenedErrors) => void) | null;

  // Form management
  registerForm: (config: FormConfig) => void;
  reset: () => void;

  // Field management
  registerField: (config: FieldConfig) => void;
  unregisterField: (fieldName: string) => void;

  // Field state updates
  setFieldValue: (fieldName: string, value: FieldValue) => void;
  setFieldTouched: (fieldName: string, touched: boolean) => void;
  setFieldBlurred: (fieldName: string) => void;

  setErrors: (errors: FlattenedErrors | null) => void;

  // Getters with selective subscription
  getFieldState: (fieldName: string) => FieldState | undefined;
  getFormValues: () => Record<string, FieldValue>;
  getFormErrors: () => string[] | null;
  getFieldErrors: (fieldName: string) => string[] | null;

  // Validation
  validateField: (fieldName: string) => Promise<void>;
  validateForm: () => Promise<boolean>;

  // Form submission
  setSubmitting: (submitting: boolean) => void;
  submitForm: () => Promise<void>;

  // Form reset
  resetForm: () => void;
  resetField: (fieldName: string) => void;
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
      errors: { formErrors: [], fieldErrors: {} },

      isSubmitting: false,
      isValidating: false,
      isDirty: false,
      isValid: true,

      submitHandler: null,
      submitInvalidHandler: null,

      registerForm: (config) => {
        set((state) => {
          state.submitHandler = config.onSubmit;
          state.submitInvalidHandler = config.onSubmitInvalid ?? null;
        });
      },

      reset: () => {
        invalidateAllValidations();
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
        });
      },

      registerField: (config) => {
        invalidateAllValidations();
        set((state) => {
          state.isValidating = false;
          state.fields.forEach((field) => {
            field.meta.isValidating = false;
          });

          const dormant = state.dormantValues.get(config.name);
          const hasDormantValue = dormant !== undefined;
          const value = hasDormantValue ? dormant.value : config.initialValue;

          if (hasDormantValue) {
            state.dormantValues.delete(config.name);
          }

          const fieldState: FieldState = {
            initialValue: config.initialValue,
            validation: config.validation,
            value,
            meta: {
              isValidating: false,
              isTouched: hasDormantValue,
              isBlurred: false,
              isDirty: hasDormantValue,
              isValid: !config.validation,
            },
          };

          state.fields.set(config.name, fieldState);

          state.isValid = calculateFormValidity(
            state.fields,
            state.errors.formErrors,
          );
        });
      },

      unregisterField: (fieldName) => {
        // Check if field exists before updating to avoid unnecessary renders
        const currentState = get();
        if (currentState.fields.has(fieldName)) {
          invalidateAllValidations();
          set((state) => {
            state.isValidating = false;
            state.fields.forEach((activeField) => {
              activeField.meta.isValidating = false;
            });

            const field = state.fields.get(fieldName);
            if (field) {
              state.dormantValues.set(fieldName, {
                initialValue: field.initialValue,
                validation: field.validation,
                value: field.value,
                meta: {
                  isValidating: false,
                  isTouched: true,
                  isBlurred: true,
                  isDirty: true,
                  isValid: field.meta.isValid,
                },
              });
            }

            state.fields.delete(fieldName);

            // Clean up any errors for this field
            if (state.errors.fieldErrors[fieldName]) {
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
              state.fields,
              state.errors.formErrors,
            );
          });
        }
      },

      setErrors: (errors) => {
        invalidateAllValidations();

        if (errors === null) {
          set((state) => {
            state.isValidating = false;
            state.fields.forEach((field) => {
              field.meta.isValidating = false;
            });

            // setErrors marks fields named by server errors invalid. Clearing
            // those errors after a successful submission must also clear that
            // server-owned invalid state; fields without client validation are
            // otherwise never revalidated and can leave the form invalid.
            Object.keys(state.errors.fieldErrors).forEach((fieldName) => {
              const field = state.fields.get(fieldName);
              if (field) field.meta.isValid = true;
            });
            state.errors = { formErrors: [], fieldErrors: {} };
            state.isValid = calculateFormValidity(state.fields, []);
          });
          return;
        }

        set((state) => {
          state.isValidating = false;
          state.fields.forEach((field) => {
            field.meta.isValidating = false;
          });

          state.errors = errors;
          Object.entries(errors.fieldErrors).forEach(
            ([fieldName, fieldErrors]) => {
              if (!fieldErrors || fieldErrors.length === 0) return;
              const field = state.fields.get(fieldName);
              if (!field) return;
              field.meta.isValid = false;
              field.meta.isTouched = true;
              field.meta.isBlurred = true;
              field.meta.isDirty = true;
            },
          );
          state.isValid = calculateFormValidity(
            state.fields,
            errors.formErrors,
          );
        });
      },

      setFieldValue: (fieldName, value) => {
        if (!get().fields.has(fieldName)) {
          // eslint-disable-next-line no-console
          console.warn(`Field "${fieldName}" is not registered.`);
          return;
        }

        invalidateAllValidations();
        set((state) => {
          state.isValidating = false;
          state.fields.forEach((field) => {
            field.meta.isValidating = false;
          });

          state.fields.get(fieldName)!.value = value;
          state.fields.get(fieldName)!.meta.isDirty = true;
          state.fields.get(fieldName)!.meta.isTouched = true;
          state.isDirty = true;
        });
      },

      setFieldTouched: (fieldName, touched) => {
        set((state) => {
          if (!state.fields.get(fieldName)) return;

          state.fields.get(fieldName)!.meta.isTouched = touched;
        });
      },

      setFieldBlurred: (fieldName) => {
        set((state) => {
          if (!state.fields.get(fieldName)) return;

          state.fields.get(fieldName)!.meta.isBlurred = true;
        });
      },

      getFieldState: (fieldName) => {
        const state = get();
        return (
          state.fields.get(fieldName) ??
          state.dormantValues.get(fieldName) ??
          undefined
        );
      },

      getFormValues: () => {
        const state = get();
        const values = {};
        // Dormant values first (lower priority)
        state.dormantValues.forEach((fieldState, fieldName) => {
          setValue(values, fieldName, fieldState.value);
        });
        // Active fields override
        state.fields.forEach((fieldState, fieldName) => {
          setValue(values, fieldName, fieldState.value);
        });
        return values as Record<string, FieldValue>;
      },

      getFormErrors: () => {
        const state = get();
        if (!state.errors) return null;

        // Return form-level errors from flattened structure
        const formErrors = state.errors.formErrors;
        return formErrors.length > 0 ? formErrors : null;
      },

      getFieldErrors: (fieldName: string) => {
        const state = get();
        if (!state.errors) return null;

        // Return field errors from flattened structure
        // Return null if no errors or empty array (consistent API)
        const fieldErrors = state.errors.fieldErrors[fieldName];
        return fieldErrors && fieldErrors.length > 0 ? fieldErrors : null;
      },
      validateField: async (fieldName) => {
        const state = get();
        const field = state.fields.get(fieldName);
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
          if (form?.fields.get(fieldName)) {
            form.fields.get(fieldName)!.meta.isValidating = true;
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
              const draftField = form?.fields.get(fieldName);
              if (draftField) {
                draftField.meta.isValidating = false;
                draftField.meta.isValid = false;

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
                  form.fields,
                  form.errors.formErrors,
                );
              }
            });
          } else {
            set((draft) => {
              const form = draft;
              if (form?.fields.get(fieldName)) {
                form.fields.get(fieldName)!.meta.isValidating = false;
                form.fields.get(fieldName)!.meta.isValid = true;

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
                  form.fields,
                  form.errors.formErrors,
                );
              }
            });
          }
        } catch {
          if (!isCurrentValidation()) return;
          set((draft) => {
            const form = draft;
            if (form?.fields.get(fieldName)) {
              form.fields.get(fieldName)!.meta.isValid = false;
              form.fields.get(fieldName)!.meta.isValidating = false;

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
                form.fields,
                form.errors.formErrors,
              );
            }
          });
        }
      },

      validateForm: async () => {
        const state = get();
        const fields = state.fields;
        const formValues = state.getFormValues();
        const validationToken = beginFormValidation();
        const isCurrentValidation = () =>
          formValidationToken === validationToken;
        const fieldErrors: Record<string, string[]> = {};

        set((draft) => {
          draft.isValidating = true;
          draft.fields.forEach((field) => {
            field.meta.isValidating = false;
          });
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
              fieldErrors[fieldName] = combinedErrors;
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
            const field = draft.fields.get(fieldName);
            if (field) {
              field.meta.isValid = isValid;
              if (markAsTouched) {
                field.meta.isTouched = true;
                field.meta.isBlurred = true;
                field.meta.isDirty = true;
              }
            }
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
          state.fields.forEach((fieldState, fieldName) => {
            state.fields.set(fieldName, {
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
          state.isValid = calculateFormValidity(state.fields, []);
        });
      },

      resetField: (fieldName) => {
        if (!get().fields.has(fieldName)) return;

        invalidateAllValidations();
        set((state) => {
          state.isValidating = false;
          state.fields.forEach((field) => {
            field.meta.isValidating = false;
          });

          const fieldConfig = state.fields.get(fieldName);
          if (!fieldConfig) return;

          const initialValue = fieldConfig.initialValue;

          state.fields.set(fieldName, {
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
            state.fields,
            state.errors.formErrors,
          );
        });
      },
    })),
  );
};
