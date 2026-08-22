import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/mini';

import type { FieldValue } from '../Field/types';
import {
  createFormStore,
  type FormStore,
  selectIsFormDirty,
} from '../store/formStore';
import type { FieldConfig, FieldState, FormConfig } from '../store/types';
import { validateFieldValue } from '../validation/helpers';

// Mock the validation utility
vi.mock('../validation/helpers', () => ({
  validateFieldValue: vi.fn(),
}));

const mockValidateFieldValue = vi.mocked(validateFieldValue);
type ValidationResult = Awaited<ReturnType<typeof validateFieldValue>>;

const getPathOperations = (store: ReturnType<typeof createFormStore>) => {
  const operations = store.getState().pathOperations;
  if (!operations) throw new Error('Expected built-in path operations');
  return operations;
};

const createDeferredValidation = () => {
  let resolve!: (result: ValidationResult) => void;
  const promise = new Promise<ValidationResult>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

describe('FormStore', () => {
  let store: ReturnType<typeof createFormStore>;

  beforeEach(() => {
    store = createFormStore();
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('keeps public field callbacks compatible with string-only stores', () => {
      const registerStringField = (config: FieldConfig) => config.name;
      const setStringField = (name: string, _value: FieldValue) => name;
      const registerField: FormStore['registerField'] = registerStringField;
      const setFieldValue: FormStore['setFieldValue'] = setStringField;

      expect(registerField({ name: 'field' })).toBe('field');
      expect(setFieldValue('field', 'value')).toBe('field');
    });

    it('keeps the published FieldState shape compatible without an internal path', () => {
      const fieldState: FieldState = {
        value: 'legacy',
        meta: {
          isValidating: false,
          isTouched: false,
          isBlurred: false,
          isDirty: false,
          isValid: true,
        },
      };

      expect(fieldState.path).toBeUndefined();
    });

    it('should have correct initial state', () => {
      const state = store.getState();

      expect(state.fields).toBeInstanceOf(Map);
      expect(state.fields.size).toBe(0);
      expect(state.isSubmitting).toBe(false);
      expect(state.isValidating).toBe(false);
      expect(state.isDirty).toBe(false);
      expect(state.isValid).toBe(true);
      expect(state.errors).toEqual({ formErrors: [], fieldErrors: {} });
      expect(state.submitHandler).toBeNull();
      expect(state.submitInvalidHandler).toBeNull();
    });
  });

  describe('Form registration', () => {
    it('should register form with config', () => {
      const onSubmit = vi.fn();
      const onSubmitInvalid = vi.fn();

      const formConfig: FormConfig = {
        onSubmit,
        onSubmitInvalid,
      };

      store.getState().registerForm(formConfig);
      const state = store.getState();

      expect(state.submitHandler).toBe(onSubmit);
      expect(state.submitInvalidHandler).toBe(onSubmitInvalid);
    });

    it('should register form without optional handlers', () => {
      const onSubmit = vi.fn();

      const formConfig: FormConfig = {
        onSubmit,
      };

      store.getState().registerForm(formConfig);
      const state = store.getState();

      expect(state.submitHandler).toBe(onSubmit);
      expect(state.submitInvalidHandler).toBeNull();
    });
  });

  describe('Field registration and management', () => {
    it('should register a field', () => {
      const fieldConfig: FieldConfig = {
        name: 'email',
        initialValue: 'test@example.com',
        validation: z.string().check(z.minLength(1, 'Email is required')),
      };

      store.getState().registerField(fieldConfig);
      const field = store.getState().getFieldState('email');

      expect(field).toBeDefined();
      expect(field?.value).toBe('test@example.com');
      expect(field?.initialValue).toBe('test@example.com');
      expect(field?.validation).toBeDefined();
      expect(field?.meta).toEqual({
        isValidating: false,
        isTouched: false,
        isBlurred: false,
        isDirty: false,
        isValid: false,
      });
    });

    it('should register field with undefined initial value when not provided', () => {
      const fieldConfig: FieldConfig = {
        name: 'username',
        validation: z.optional(z.string()),
      };

      store.getState().registerField(fieldConfig);
      const field = store.getState().getFieldState('username');

      expect(field?.value).toBeUndefined();
      expect(field?.initialValue).toBeUndefined();
    });

    it('makes a standing field error visible when its field registers', () => {
      store.getState().setErrors({
        formErrors: [],
        fieldErrors: { email: ['Already invalid'] },
      });

      store.getState().registerField({
        name: 'email',
        initialValue: '',
        validation: z.optional(z.string()),
      });

      expect(store.getState().getFieldErrors('email')).toEqual([
        'Already invalid',
      ]);
      expect(store.getState().getFieldState('email')?.meta).toMatchObject({
        isValid: false,
        isTouched: true,
        isBlurred: true,
        isDirty: true,
      });
      expect(store.getState().isValid).toBe(false);
    });

    it('should unregister a field', () => {
      const fieldConfig: FieldConfig = {
        name: 'email',
        initialValue: 'test@example.com',
        validation: z.optional(z.string()),
      };

      store.getState().registerField(fieldConfig);
      expect(store.getState().getFieldState('email')).toBeDefined();

      store.getState().unregisterField('email');
      // Field is no longer in the active fields Map
      expect(store.getState().fields.has('email')).toBe(false);
      // But getFieldState returns a synthetic state from dormant values
      expect(store.getState().getFieldState('email')?.value).toBe(
        'test@example.com',
      );
    });

    it('should not error when unregistering non-existent field', () => {
      expect(() => {
        store.getState().unregisterField('nonexistent');
      }).not.toThrow();
    });

    it('should clean up field errors when unregistering a field', async () => {
      const fieldConfig: FieldConfig = {
        name: 'email',
        initialValue: 'test@example.com',
        validation: z.string().check(z.minLength(1, 'Email is required')),
      };

      store.getState().registerField(fieldConfig);

      // Set an error for the field
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Invalid email', path: ['email'] },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });
      await store.getState().validateField('email');

      // Verify error exists
      expect(store.getState().getFieldErrors('email')).toEqual([
        'Invalid email',
      ]);

      // Unregister the field
      store.getState().unregisterField('email');

      // Error should be cleaned up
      expect(store.getState().getFieldErrors('email')).toBeNull();
      expect(store.getState().errors.fieldErrors).toEqual({});
    });

    it('should recalculate form validity when unregistering a field', async () => {
      // Register two fields with validation
      store.getState().registerField({
        name: 'field1',
        validation: z.string().check(z.minLength(1)),
      });
      store.getState().registerField({
        name: 'field2',
        validation: z.string().check(z.minLength(1)),
      });

      // Validate field1 successfully
      mockValidateFieldValue.mockResolvedValueOnce({
        success: true,
        data: 'value1',
      });
      await store.getState().validateField('field1');

      // Form is still invalid because field2 hasn't been validated
      expect(store.getState().isValid).toBe(false);

      // Unregister field2 (the invalid one)
      store.getState().unregisterField('field2');

      // Now form should be valid (only field1 remains and it's valid)
      expect(store.getState().isValid).toBe(true);
    });
  });

  /**
   * The live answer to "does this form hold unsaved work?", which every guard
   * that could destroy that work has to consult — Architect's nested-editor
   * discard confirmation, its cross-tab lock. Deliberately NOT the `isDirty`
   * flag beside it: that one is sticky, and each of these cases is a way the
   * two disagree.
   */
  describe('selectIsFormDirty', () => {
    it('is false for a form nothing has been typed into', () => {
      store.getState().registerField({ name: 'email', initialValue: 'a@b.c' });

      expect(selectIsFormDirty(store.getState())).toBe(false);
    });

    it('is true once a field differs from what it registered with', () => {
      store.getState().registerField({ name: 'email', initialValue: 'a@b.c' });
      store.getState().setFieldValue('email', 'd@e.f');

      expect(selectIsFormDirty(store.getState())).toBe(true);
    });

    // The whole reason for a live comparison. The sticky flag stays true here,
    // which is how a form the researcher had already put back by hand ended up
    // being guarded as unsaved work.
    it('returns to false when an edit is typed back to where it started', () => {
      store.getState().registerField({ name: 'email', initialValue: 'a@b.c' });
      store.getState().setFieldValue('email', 'd@e.f');
      store.getState().setFieldValue('email', 'a@b.c');

      expect(store.getState().isDirty).toBe(true);
      expect(selectIsFormDirty(store.getState())).toBe(false);
    });

    // A field registered without an initial value holds `undefined`; clearing
    // it after typing leaves `''`. Same state to the person editing.
    it.each([
      ['', undefined],
      [undefined, ''],
      [[], undefined],
    ])('treats %o and %o as the same emptiness', (value, initialValue) => {
      store.getState().registerField({
        name: 'field',
        initialValue: initialValue as FieldValue,
      });
      store.getState().setFieldValue('field', value as FieldValue);

      expect(selectIsFormDirty(store.getState())).toBe(false);
    });

    // A field that unmounts parks its value in `dormantValues`; an edit made
    // before it unmounted is still an unsaved edit.
    it('counts an edit parked by a field that has since unmounted', () => {
      store.getState().registerField({ name: 'email', initialValue: 'a@b.c' });
      store.getState().setFieldValue('email', 'd@e.f');
      store.getState().unregisterField('email');

      expect(store.getState().fields.has('email')).toBe(false);
      expect(selectIsFormDirty(store.getState())).toBe(true);
    });
  });

  describe('Field value updates', () => {
    beforeEach(() => {
      const fieldConfig: FieldConfig = {
        name: 'email',
        initialValue: '',
        validation: z.optional(z.string()),
      };
      store.getState().registerField(fieldConfig);
    });

    it('should update field value and mark as dirty', () => {
      store.getState().setFieldValue('email', 'new@example.com');
      const field = store.getState().getFieldState('email');

      expect(field?.value).toBe('new@example.com');
      expect(field?.meta.isDirty).toBe(true);
    });

    it('should not add a value for a non-existent field to form values', () => {
      store.getState().setFieldValue('nonexistent', 'value');

      expect(store.getState().fields.has('nonexistent')).toBe(false);
      expect(store.getState().getFormValues()).not.toHaveProperty(
        'nonexistent',
      );
    });

    it('should set field error and update validity through validation', async () => {
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Invalid email format', path: ['email'] },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });

      await store.getState().validateField('email');
      const field = store.getState().getFieldState('email');
      const state = store.getState();
      const fieldErrors = state.getFieldErrors('email');

      expect(fieldErrors).toEqual(['Invalid email format']);
      expect(field?.meta.isValid).toBe(false);
      expect(state.isValid).toBe(false);
    });

    it('should clear field error through successful validation', async () => {
      // First set an error
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Invalid email', path: ['email'] },
      ]);
      mockValidateFieldValue.mockResolvedValueOnce({
        success: false,
        error: mockError,
      });
      await store.getState().validateField('email');

      // Then clear it with successful validation
      mockValidateFieldValue.mockResolvedValueOnce({
        success: true,
        data: 'test@example.com',
      });
      await store.getState().validateField('email');

      const field = store.getState().getFieldState('email');
      const fieldErrors = store.getState().getFieldErrors('email');
      expect(fieldErrors).toBeNull();
      expect(field?.meta.isValid).toBe(true);
    });

    it('should set field touched', () => {
      store.getState().setFieldTouched('email', true);
      const field = store.getState().getFieldState('email');

      expect(field?.meta.isTouched).toBe(true);
    });

    it('should set field dirty when value changes', () => {
      store.getState().setFieldValue('email', 'new@example.com');
      const field = store.getState().getFieldState('email');

      expect(field?.meta.isDirty).toBe(true);
      // Note: form-level isDirty is not automatically calculated in current implementation
    });
  });

  describe('Form-level state updates', () => {
    it('should update form validity based on all fields', async () => {
      // Register multiple fields with validation
      store
        .getState()
        .registerField({ name: 'field1', validation: z.optional(z.string()) });
      store
        .getState()
        .registerField({ name: 'field2', validation: z.optional(z.string()) });

      // Fields with validation start as invalid until validated
      expect(store.getState().isValid).toBe(false);

      // Validate field1 successfully
      mockValidateFieldValue.mockResolvedValueOnce({
        success: true,
        data: 'field1_value',
      });
      await store.getState().validateField('field1');
      // Still invalid because field2 hasn't been validated
      expect(store.getState().isValid).toBe(false);

      // Validate field2 successfully - now both are valid
      mockValidateFieldValue.mockResolvedValueOnce({
        success: true,
        data: 'field2_value',
      });
      await store.getState().validateField('field2');
      expect(store.getState().isValid).toBe(true);

      // Set field1 as invalid through validation
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Error', path: ['field1'] },
      ]);
      mockValidateFieldValue.mockResolvedValueOnce({
        success: false,
        error: mockError,
      });
      await store.getState().validateField('field1');
      expect(store.getState().isValid).toBe(false);
    });

    it('should consider fields without validation as valid by default', () => {
      // Register fields without validation
      store.getState().registerField({ name: 'field1' });
      store.getState().registerField({ name: 'field2' });

      // Form should be valid because fields without validation are valid by default
      expect(store.getState().isValid).toBe(true);

      const field1 = store.getState().getFieldState('field1');
      const field2 = store.getState().getFieldState('field2');
      expect(field1?.meta.isValid).toBe(true);
      expect(field2?.meta.isValid).toBe(true);
    });

    it('should update form dirty state based on any field being dirty', () => {
      store
        .getState()
        .registerField({ name: 'field1', validation: z.optional(z.string()) });
      store
        .getState()
        .registerField({ name: 'field2', validation: z.optional(z.string()) });

      expect(store.getState().isDirty).toBe(false);

      store.getState().setFieldValue('field1', 'changed_value');
      const field1 = store.getState().getFieldState('field1');
      expect(field1?.meta.isDirty).toBe(true);

      // Reset the field to make it not dirty
      store.getState().resetField('field1');
      const resetField1 = store.getState().getFieldState('field1');
      expect(resetField1?.meta.isDirty).toBe(false);
    });

    it('should update form validating state based on any field validating', () => {
      store
        .getState()
        .registerField({ name: 'field1', validation: z.optional(z.string()) });
      store
        .getState()
        .registerField({ name: 'field2', validation: z.optional(z.string()) });

      expect(store.getState().isValidating).toBe(false);
    });
  });

  describe('Form data getters', () => {
    beforeEach(() => {
      store.getState().registerField({
        name: 'user.name',
        initialValue: 'John',
        validation: z.optional(z.string()),
      });
      store.getState().registerField({
        name: 'user.email',
        initialValue: 'john@example.com',
        validation: z.optional(z.string()),
      });
      store.getState().registerField({
        name: 'preferences.theme',
        initialValue: 'dark',
        validation: z.optional(z.string()),
      });
    });

    it('should get form values with nested structure', () => {
      const values = store.getState().getFormValues();

      expect(values).toEqual({
        user: {
          name: 'John',
          email: 'john@example.com',
        },
        preferences: {
          theme: 'dark',
        },
      });
    });

    it('round-trips an opaque dotted field name as one output key', () => {
      store.getState().reset();
      getPathOperations(store).registerField({
        name: ['favorite.color'],
        initialValue: 'blue',
      });

      expect(
        getPathOperations(store).getFieldState(['favorite.color'])?.value,
      ).toBe('blue');
      expect(store.getState().getFormValues()).toEqual({
        'favorite.color': 'blue',
      });
      expect(store.getState().getFormValues()).toBeInstanceOf(Object);
    });

    it.each(['favorite.color', 'weight[kg]'])(
      'keeps the public field map keyed by %s',
      (name) => {
        store.getState().reset();
        const pathOperations = getPathOperations(store);
        pathOperations.registerField({
          name: [name],
          submissionErrorKey: name,
          initialValue: 'initial',
        });

        expect(store.getState().fields.get(name)?.value).toBe('initial');
        expect(store.getState().fields.has(`["${name}"]`)).toBe(false);

        pathOperations.setFieldValue([name], 'updated');

        expect(store.getState().fields.get(name)?.value).toBe('updated');
        expect(store.getState().fields.size).toBe(1);
      },
    );

    it.each(['settings["locale"]', 'matrix[0][1]'])(
      'preserves the legacy string store reference %s as one output key',
      (name) => {
        store.getState().reset();
        store.getState().registerField({ name, initialValue: 'preserved' });
        store.getState().setFieldValue(name, 'updated');

        expect(store.getState().getFieldState(name)?.value).toBe('updated');
        expect(store.getState().getFormValues()).toEqual({
          [name]: 'updated',
        });
      },
    );

    it('combines nested namespace segments with an opaque dotted field name', () => {
      store.getState().reset();
      getPathOperations(store).registerField({
        name: ['steps', 0, 'egg-parent', 'favorite.color'],
        initialValue: 'blue',
      });

      expect(store.getState().getFormValues()).toEqual({
        steps: [{ 'egg-parent': { 'favorite.color': 'blue' } }],
      });
    });

    it('preserves bracket arrays and sparse array positions', () => {
      store.getState().reset();
      store.getState().registerField({
        name: 'steps[0].egg-parent.name',
        initialValue: 'Alice',
      });
      store.getState().registerField({
        name: 'steps[2].egg-parent.name',
        initialValue: 'Charlie',
      });

      expect(store.getState().getFormValues()).toEqual({
        steps: [
          { 'egg-parent': { name: 'Alice' } },
          undefined,
          { 'egg-parent': { name: 'Charlie' } },
        ],
      });
    });

    it('preserves an array length field while assembling values', () => {
      store.getState().reset();
      store.getState().registerField({
        name: 'items[0]',
        initialValue: 'first',
      });
      store.getState().registerField({
        name: 'items.length',
        initialValue: 3,
      });

      expect(store.getState().getFormValues()).toEqual({
        items: ['first', undefined, undefined],
      });
    });

    it.each([
      ['constructor[0]', 'constructor'],
      ['prototype[0]', 'prototype'],
    ])('preserves the legacy forced-array field %s', (name, key) => {
      store.getState().reset();
      store.getState().registerField({ name, initialValue: 'preserved' });

      const values = store.getState().getFormValues();

      expect(Object.hasOwn(values, key)).toBe(true);
      expect(Object.getOwnPropertyDescriptor(values, key)?.value).toEqual([
        'preserved',
      ]);
      expect(Object.hasOwn(Object.prototype, 'frescoUiPolluted')).toBe(false);
    });

    it('preserves a nested constructor forced-array field', () => {
      store.getState().reset();
      store.getState().registerField({
        name: 'safe.constructor[0]',
        initialValue: 'preserved',
      });

      expect(store.getState().getFormValues()).toEqual({
        safe: { constructor: ['preserved'] },
      });
      expect(Object.hasOwn(Object.prototype, 'frescoUiPolluted')).toBe(false);
    });

    it('keeps overlapping container and leaf fields when the container is frozen', () => {
      store.getState().reset();
      store.getState().registerField({
        name: 'mapOptions.style',
        initialValue: 'streets',
      });
      store.getState().registerField({
        name: 'mapOptions',
        initialValue: Object.freeze({ color: 'blue', style: 'satellite' }),
      });

      expect(store.getState().getFormValues()).toEqual({
        mapOptions: { color: 'blue', style: 'streets' },
      });
    });

    it.each([
      '__proto__.frescoUiPolluted',
      'safe.__proto__.frescoUiPolluted',
      'constructor.prototype',
      'prototype.frescoUiPolluted',
    ])('rejects unsafe registered field path %s', (name) => {
      store.getState().reset();
      expect(() =>
        store.getState().registerField({ name, initialValue: 'polluted' }),
      ).toThrow(`Unsafe form field path: ${name}`);
      expect(Object.hasOwn(Object.prototype, 'frescoUiPolluted')).toBe(false);
      expect(
        Object.getOwnPropertyDescriptor(Object.prototype, 'frescoUiPolluted'),
      ).toBeUndefined();
    });

    it.each(['__proto__', 'constructor', 'prototype'])(
      'keeps the terminal legacy field %s as an inert own output key',
      (name) => {
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(
          Object.prototype,
          name,
        );
        store.getState().reset();
        store.getState().registerField({ name, initialValue: 'preserved' });

        const values = store.getState().getFormValues();

        expect(Object.hasOwn(values, name)).toBe(true);
        expect(values[name]).toBe('preserved');
        expect(Object.getOwnPropertyDescriptor(Object.prototype, name)).toEqual(
          prototypeDescriptor,
        );
      },
    );

    it('should get form errors with nested structure', async () => {
      const mockError1 = new z.core.$ZodError([
        { code: 'custom', message: 'Name required', path: ['user', 'name'] },
      ]);
      const mockError2 = new z.core.$ZodError([
        { code: 'custom', message: 'Invalid email', path: ['user', 'email'] },
      ]);

      mockValidateFieldValue.mockResolvedValueOnce({
        success: false,
        error: mockError1,
      });
      await store.getState().validateField('user.name');

      mockValidateFieldValue.mockResolvedValueOnce({
        success: false,
        error: mockError2,
      });
      await store.getState().validateField('user.email');

      const errors = store.getState().getFormErrors();

      // The current implementation returns form-level errors as a string array,
      // not nested field errors, so we expect null if no form-level errors
      expect(errors).toBeNull();
    });

    it('should return null when no form-level errors', () => {
      const errors = store.getState().getFormErrors();
      expect(errors).toBeNull();
    });

    it('marks fields returned by the server as visible and invalid', () => {
      store.getState().setErrors({
        formErrors: [],
        fieldErrors: { 'user.name': ['Already exists'] },
      });

      const field = store.getState().getFieldState('user.name');
      expect(field?.meta).toMatchObject({
        isValid: false,
        isTouched: true,
        isBlurred: true,
        isDirty: true,
      });
      expect(store.getState().isValid).toBe(false);
    });

    it('maps an opaque dotted submission error to its registered field path', () => {
      getPathOperations(store).registerField({
        name: ['steps', 0, 'favorite.color'],
        submissionErrorKey: 'favorite.color',
        initialValue: 'blue',
      });

      store.getState().setErrors({
        formErrors: [],
        fieldErrors: { 'favorite.color': ['Choose another color'] },
      });

      expect(store.getState().errors).toEqual({
        formErrors: [],
        fieldErrors: {
          'steps[0]["favorite.color"]': ['Choose another color'],
        },
      });
      expect(store.getState().errors.fieldErrors).toBeInstanceOf(Object);
      expect(
        getPathOperations(store).getFieldErrors(['steps', 0, 'favorite.color']),
      ).toEqual(['Choose another color']);
      expect(
        getPathOperations(store).getFieldState(['steps', 0, 'favorite.color'])
          ?.meta,
      ).toMatchObject({
        isValid: false,
        isTouched: true,
        isBlurred: true,
        isDirty: true,
      });
    });

    it('does not assign an ambiguous opaque error alias to a structural field', () => {
      const initialFieldCount = store.getState().fields.size;
      getPathOperations(store).registerField({
        name: ['favorite.color'],
        submissionErrorKey: 'favorite.color',
        initialValue: 'blue',
      });
      store.getState().registerField({
        name: 'favorite.color',
        initialValue: 'green',
      });

      store.getState().setErrors({
        formErrors: [],
        fieldErrors: { 'favorite.color': ['Choose another color'] },
      });

      expect(store.getState().errors).toEqual({
        formErrors: ['Choose another color'],
        fieldErrors: {},
      });
      expect(
        getPathOperations(store).getFieldErrors(['favorite.color']),
      ).toBeNull();
      expect(store.getState().getFieldErrors('favorite.color')).toBeNull();
      expect(
        getPathOperations(store).getFieldState(['favorite.color'])?.meta
          .isValid,
      ).toBe(true);
      expect(
        store.getState().getFieldState('favorite.color')?.meta.isValid,
      ).toBe(true);
      expect(store.getState().fields.size).toBe(initialFieldCount + 2);
      expect(store.getState().fields.get('favorite.color')?.value).toBe(
        'green',
      );
      expect(store.getState().isValid).toBe(false);
    });

    it('resolves a public field alias for every string store operation', () => {
      const pathOperations = getPathOperations(store);
      pathOperations.registerField({
        name: ['settings', 'locale'],
        submissionErrorKey: 'settings["locale"]',
        initialValue: 'en',
      });

      expect(store.getState().getFieldState('settings["locale"]')?.value).toBe(
        'en',
      );

      store.getState().setFieldValue('settings["locale"]', 'fr');

      expect(pathOperations.getFieldState(['settings', 'locale'])?.value).toBe(
        'fr',
      );
    });

    it('resolves an unsafe-looking opaque public alias without parsing it', () => {
      const pathOperations = getPathOperations(store);
      pathOperations.registerField({
        name: ['safe.__proto__.polluted'],
        submissionErrorKey: 'safe.__proto__.polluted',
        initialValue: 'preserved',
      });

      expect(
        store.getState().getFieldState('safe.__proto__.polluted')?.value,
      ).toBe('preserved');
      expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    });

    it('restores an unvalidated field after server errors clear on successful validation', async () => {
      // This regression is intentionally scoped to a single field without a
      // client schema; the surrounding getter tests register other fields.
      store.getState().reset();
      store.getState().registerField({
        name: 'username',
        initialValue: 'existing',
      });
      store.getState().setErrors({
        formErrors: [],
        fieldErrors: { username: ['Already exists'] },
      });

      expect(store.getState().getFieldState('username')?.meta.isValid).toBe(
        false,
      );

      expect(await store.getState().validateForm()).toBe(true);
      store.getState().setErrors(null);

      expect(store.getState().getFieldState('username')?.meta.isValid).toBe(
        true,
      );
      expect(store.getState().isValid).toBe(true);
    });
  });

  describe('Field validation', () => {
    beforeEach(() => {
      store.getState().registerField({
        name: 'email',
        initialValue: 'test@example.com',
        validation: z.string().check(z.minLength(1, 'Email is required')),
      });
    });

    it('should validate field successfully', async () => {
      mockValidateFieldValue.mockResolvedValue({
        success: true,
        data: 'test@example.com',
      });

      await store.getState().validateField('email');
      const field = store.getState().getFieldState('email');
      const state = store.getState();
      const fieldErrors = state.getFieldErrors('email');

      expect(field?.meta.isValidating).toBe(false);
      expect(field?.meta.isValid).toBe(true);
      expect(fieldErrors).toBeNull();
      expect(state.isValid).toBe(true);
    });

    it('should handle field validation errors', async () => {
      const mockError = new z.core.$ZodError([
        {
          code: 'custom',
          message: 'Email is required',
          path: ['email'],
        },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });

      await store.getState().validateField('email');
      const field = store.getState().getFieldState('email');
      const state = store.getState();
      const fieldErrors = state.getFieldErrors('email');

      // Note: isValidating is not set to false in error case in current implementation
      expect(field?.meta.isValid).toBe(false);
      expect(fieldErrors).toEqual(['Email is required']);
      expect(state.isValid).toBe(false);
    });

    it('should handle validation exceptions', async () => {
      mockValidateFieldValue.mockRejectedValue(new Error('Validation failed'));

      await store.getState().validateField('email');
      const field = store.getState().getFieldState('email');
      const fieldErrors = store.getState().getFieldErrors('email');

      expect(field?.meta.isValidating).toBe(false);
      expect(field?.meta.isValid).toBe(false);
      expect(fieldErrors).toEqual(['Something went wrong during validation']);
    });

    it('ignores a stale async result that resolves after a newer validation', async () => {
      const oldValidation = createDeferredValidation();
      const newValidation = createDeferredValidation();
      mockValidateFieldValue
        .mockReturnValueOnce(oldValidation.promise)
        .mockReturnValueOnce(newValidation.promise);

      const oldRequest = store.getState().validateField('email');
      store.getState().setFieldValue('email', 'new@example.com');
      const newRequest = store.getState().validateField('email');

      newValidation.resolve({ success: true, data: 'new@example.com' });
      await newRequest;
      oldValidation.resolve({
        success: false,
        error: new z.core.$ZodError([
          { code: 'custom', message: 'Stale error', path: [] },
        ]),
      });
      await oldRequest;

      expect(store.getState().getFieldErrors('email')).toBeNull();
      expect(store.getState().getFieldState('email')?.meta.isValid).toBe(true);
      expect(store.getState().getFieldState('email')?.meta.isValidating).toBe(
        false,
      );
    });

    it('ignores a pending result when the value changes before debounced validation restarts', async () => {
      const validation = createDeferredValidation();
      mockValidateFieldValue.mockReturnValueOnce(validation.promise);

      const request = store.getState().validateField('email');
      expect(store.getState().getFieldState('email')?.meta.isValidating).toBe(
        true,
      );

      store.getState().setFieldValue('email', 'new@example.com');

      expect(store.getState().getFieldState('email')?.meta.isValidating).toBe(
        false,
      );
      validation.resolve({
        success: false,
        error: new z.core.$ZodError([
          { code: 'custom', message: 'Error for old value', path: [] },
        ]),
      });
      await request;

      expect(store.getState().getFieldState('email')?.value).toBe(
        'new@example.com',
      );
      expect(store.getState().getFieldErrors('email')).toBeNull();
      expect(store.getState().getFieldState('email')?.meta.isValidating).toBe(
        false,
      );
    });

    it('does not restore an error after a field is reset during validation', async () => {
      store.getState().setFieldValue('email', 'changed@example.com');
      const validation = createDeferredValidation();
      mockValidateFieldValue.mockReturnValueOnce(validation.promise);

      const request = store.getState().validateField('email');
      store.getState().resetField('email');
      validation.resolve({
        success: false,
        error: new z.core.$ZodError([
          { code: 'custom', message: 'Stale reset error', path: [] },
        ]),
      });
      await request;

      const field = store.getState().getFieldState('email');
      expect(field?.value).toBe('test@example.com');
      expect(field?.meta).toMatchObject({
        isValidating: false,
        isTouched: false,
        isDirty: false,
        isValid: false,
      });
      expect(store.getState().getFieldErrors('email')).toBeNull();
    });

    it('preserves a newer server error when an older validation succeeds', async () => {
      const validation = createDeferredValidation();
      mockValidateFieldValue.mockReturnValueOnce(validation.promise);

      const request = store.getState().validateField('email');
      store.getState().setErrors({
        formErrors: [],
        fieldErrors: { email: ['Email is already registered'] },
      });
      validation.resolve({ success: true, data: 'test@example.com' });
      await request;

      expect(store.getState().getFieldErrors('email')).toEqual([
        'Email is already registered',
      ]);
      expect(store.getState().getFieldState('email')?.meta).toMatchObject({
        isValidating: false,
        isValid: false,
      });
    });

    it('does not reuse a pending validation token after reset and re-registration', async () => {
      const oldValidation = createDeferredValidation();
      const newValidation = createDeferredValidation();
      mockValidateFieldValue
        .mockReturnValueOnce(oldValidation.promise)
        .mockReturnValueOnce(newValidation.promise);

      const oldRequest = store.getState().validateField('email');
      store.getState().unregisterField('email');
      store.getState().reset();
      store.getState().registerField({
        name: 'email',
        initialValue: 'replacement@example.com',
        validation: z.string().check(z.minLength(1, 'Email is required')),
      });
      const newRequest = store.getState().validateField('email');

      oldValidation.resolve({
        success: false,
        error: new z.core.$ZodError([
          { code: 'custom', message: 'Error from old registration', path: [] },
        ]),
      });
      await oldRequest;

      expect(store.getState().getFieldErrors('email')).toBeNull();
      expect(store.getState().getFieldState('email')?.meta.isValidating).toBe(
        true,
      );

      newValidation.resolve({
        success: true,
        data: 'replacement@example.com',
      });
      await newRequest;

      expect(store.getState().getFieldState('email')?.value).toBe(
        'replacement@example.com',
      );
      expect(store.getState().getFieldErrors('email')).toBeNull();
      expect(store.getState().getFieldState('email')?.meta).toMatchObject({
        isValidating: false,
        isValid: true,
      });
    });

    it('should not validate non-existent field', async () => {
      await expect(
        store.getState().validateField('nonexistent'),
      ).resolves.not.toThrow();
    });

    describe('superseded by a sibling value change', () => {
      // Drop the surrounding suite's 'email' field, then register fieldA as
      // intrinsically valid (no validation) so form validity reflects fieldB
      // alone.
      const registerFields = () => {
        store.getState().reset();
        store.getState().registerField({
          name: 'fieldA',
          initialValue: '',
        });
        store.getState().registerField({
          name: 'fieldB',
          initialValue: 'value-b',
          validation: z.string().check(z.minLength(1, 'Field B is required')),
        });
      };

      // The rescheduled validation is fire-and-forget, so settle it via a
      // macrotask, which runs after all pending microtask continuations.
      const flushPendingValidations = () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });

      it('revalidates a field whose in-flight validation was superseded by a sibling value change', async () => {
        registerFields();
        const supersededValidation = createDeferredValidation();
        const rescheduledValidation = createDeferredValidation();
        mockValidateFieldValue
          .mockReturnValueOnce(supersededValidation.promise)
          .mockReturnValueOnce(rescheduledValidation.promise);

        const supersededRequest = store.getState().validateField('fieldB');
        store.getState().setFieldValue('fieldA', 'typed');

        // Rescheduled immediately, against the updated form values
        expect(mockValidateFieldValue).toHaveBeenCalledTimes(2);
        expect(mockValidateFieldValue).toHaveBeenLastCalledWith(
          'value-b',
          expect.any(Object),
          expect.objectContaining({ fieldA: 'typed', fieldB: 'value-b' }),
        );

        supersededValidation.resolve({ success: true, data: 'value-b' });
        await supersededRequest;
        rescheduledValidation.resolve({ success: true, data: 'value-b' });
        await flushPendingValidations();

        const fieldB = store.getState().getFieldState('fieldB');
        expect(fieldB?.meta.isValidating).toBe(false);
        expect(fieldB?.meta.isValid).toBe(true);
        expect(store.getState().getFieldErrors('fieldB')).toBeNull();
        expect(store.getState().isValid).toBe(true);
      });

      it('drops the superseded result even when it resolves after the rescheduled validation', async () => {
        registerFields();
        const supersededValidation = createDeferredValidation();
        const rescheduledValidation = createDeferredValidation();
        mockValidateFieldValue
          .mockReturnValueOnce(supersededValidation.promise)
          .mockReturnValueOnce(rescheduledValidation.promise);

        const supersededRequest = store.getState().validateField('fieldB');
        store.getState().setFieldValue('fieldA', 'typed');

        rescheduledValidation.resolve({ success: true, data: 'value-b' });
        await flushPendingValidations();
        supersededValidation.resolve({
          success: false,
          error: new z.core.$ZodError([
            { code: 'custom', message: 'Stale error', path: [] },
          ]),
        });
        await supersededRequest;

        expect(store.getState().getFieldErrors('fieldB')).toBeNull();
        expect(store.getState().getFieldState('fieldB')?.meta.isValid).toBe(
          true,
        );
        expect(store.getState().isValid).toBe(true);
      });

      it('keeps a superseded field invalid when revalidation against the new values fails', async () => {
        registerFields();
        const supersededValidation = createDeferredValidation();
        const rescheduledValidation = createDeferredValidation();
        mockValidateFieldValue
          .mockReturnValueOnce(supersededValidation.promise)
          .mockReturnValueOnce(rescheduledValidation.promise);

        const supersededRequest = store.getState().validateField('fieldB');
        store.getState().setFieldValue('fieldA', 'typed');

        // A stale success from the pre-change snapshot must not win either
        supersededValidation.resolve({ success: true, data: 'value-b' });
        await supersededRequest;
        rescheduledValidation.resolve({
          success: false,
          error: new z.core.$ZodError([
            { code: 'custom', message: 'Field B is required', path: [] },
          ]),
        });
        await flushPendingValidations();

        expect(store.getState().getFieldErrors('fieldB')).toEqual([
          'Field B is required',
        ]);
        expect(store.getState().getFieldState('fieldB')?.meta.isValid).toBe(
          false,
        );
        expect(store.getState().isValid).toBe(false);
      });

      it('does not reschedule validation for the field whose own value changed', async () => {
        registerFields();
        const validation = createDeferredValidation();
        mockValidateFieldValue.mockReturnValueOnce(validation.promise);

        const request = store.getState().validateField('fieldB');
        store.getState().setFieldValue('fieldB', 'updated');

        expect(mockValidateFieldValue).toHaveBeenCalledTimes(1);
        expect(
          store.getState().getFieldState('fieldB')?.meta.isValidating,
        ).toBe(false);

        validation.resolve({ success: true, data: 'value-b' });
        await request;

        // The stale result is dropped; the field's component owns the
        // debounced revalidation of its own value.
        expect(store.getState().getFieldState('fieldB')?.meta.isValid).toBe(
          false,
        );
        expect(store.getState().getFieldErrors('fieldB')).toBeNull();
      });

      it.each(['__proto__', 'constructor', 'prototype'])(
        'reschedules the opaque dangerous field %s by its stored path',
        async (name) => {
          store.getState().reset();
          store.getState().registerField({ name: 'fieldA', initialValue: '' });
          getPathOperations(store).registerField({
            name: [name],
            initialValue: 'preserved',
            validation: z.string(),
          });
          const supersededValidation = createDeferredValidation();
          const rescheduledValidation = createDeferredValidation();
          mockValidateFieldValue
            .mockReturnValueOnce(supersededValidation.promise)
            .mockReturnValueOnce(rescheduledValidation.promise);

          const supersededRequest = getPathOperations(store).validateField([
            name,
          ]);
          store.getState().setFieldValue('fieldA', 'typed');

          expect(mockValidateFieldValue).toHaveBeenCalledTimes(2);
          supersededValidation.resolve({
            success: true,
            data: 'preserved',
          });
          await supersededRequest;
          rescheduledValidation.resolve({
            success: true,
            data: 'preserved',
          });
          await flushPendingValidations();

          expect(
            getPathOperations(store).getFieldState([name])?.meta.isValid,
          ).toBe(true);
        },
      );
    });

    it('should pass correct parameters to validateFieldValue', async () => {
      mockValidateFieldValue.mockResolvedValue({
        success: true,
        data: 'test@example.com',
      });

      await store.getState().validateField('email');

      expect(mockValidateFieldValue).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(Object), // The validation schema
        expect.objectContaining({
          email: 'test@example.com',
        }), // Form values
      );
    });
  });

  describe('Form validation', () => {
    beforeEach(() => {
      store.getState().registerField({
        name: 'field1',
        initialValue: 'value1',
        validation: z.string().check(z.minLength(1, 'Email is required')),
      });
      store.getState().registerField({
        name: 'field2',
        initialValue: 'value2',
        validation: z
          .string()
          .check(z.minLength(5, 'Field must be at least 5 characters')),
      });
    });

    it('should validate all fields successfully', async () => {
      mockValidateFieldValue.mockResolvedValue({
        success: true,
        data: 'field_value',
      });

      const result = await store.getState().validateForm();
      const state = store.getState();

      expect(result).toBe(true);
      expect(state.isValid).toBe(true);
      expect(mockValidateFieldValue).toHaveBeenCalledTimes(2);
    });

    it('supersedes a pending field validation with form validation', async () => {
      const oldFieldValidation = createDeferredValidation();
      const formField1Validation = createDeferredValidation();
      const formField2Validation = createDeferredValidation();
      mockValidateFieldValue
        .mockReturnValueOnce(oldFieldValidation.promise)
        .mockReturnValueOnce(formField1Validation.promise)
        .mockReturnValueOnce(formField2Validation.promise);

      const oldFieldRequest = store.getState().validateField('field1');
      const formRequest = store.getState().validateForm();

      expect(store.getState().isValidating).toBe(true);
      expect(store.getState().getFieldState('field1')?.meta.isValidating).toBe(
        false,
      );

      oldFieldValidation.resolve({
        success: false,
        error: new z.core.$ZodError([
          { code: 'custom', message: 'Stale field error', path: [] },
        ]),
      });
      await oldFieldRequest;

      expect(store.getState().getFieldErrors('field1')).toBeNull();
      expect(store.getState().isValidating).toBe(true);

      formField1Validation.resolve({ success: true, data: 'value1' });
      formField2Validation.resolve({ success: true, data: 'value2' });

      await expect(formRequest).resolves.toBe(true);
      expect(store.getState().getFieldErrors('field1')).toBeNull();
      expect(store.getState().isValidating).toBe(false);
    });

    it('does not let delayed field validation cancel form validation', async () => {
      const formField1Validation = createDeferredValidation();
      const formField2Validation = createDeferredValidation();
      mockValidateFieldValue
        .mockReturnValueOnce(formField1Validation.promise)
        .mockReturnValueOnce(formField2Validation.promise);

      const formRequest = store.getState().validateForm();
      expect(store.getState().isValidating).toBe(true);

      await store.getState().validateField('field1');

      expect(mockValidateFieldValue).toHaveBeenCalledTimes(2);
      expect(store.getState().isValidating).toBe(true);

      formField1Validation.resolve({ success: true, data: 'value1' });
      formField2Validation.resolve({ success: true, data: 'value2' });

      await expect(formRequest).resolves.toBe(true);
      expect(store.getState().isValidating).toBe(false);
      expect(store.getState().isValid).toBe(true);
    });

    it('does not let stale form validation clear newer server errors', async () => {
      const field1Validation = createDeferredValidation();
      const field2Validation = createDeferredValidation();
      mockValidateFieldValue
        .mockReturnValueOnce(field1Validation.promise)
        .mockReturnValueOnce(field2Validation.promise);

      const request = store.getState().validateForm();
      expect(store.getState().isValidating).toBe(true);

      store.getState().setErrors({
        formErrors: ['The server rejected this form'],
        fieldErrors: { field1: ['This value already exists'] },
      });
      expect(store.getState().isValidating).toBe(false);

      field1Validation.resolve({ success: true, data: 'value1' });
      field2Validation.resolve({ success: true, data: 'value2' });

      await expect(request).resolves.toBe(false);
      expect(store.getState().errors).toEqual({
        formErrors: ['The server rejected this form'],
        fieldErrors: { field1: ['This value already exists'] },
      });
      expect(store.getState().getFieldState('field1')?.meta.isValid).toBe(
        false,
      );
    });

    it('clears form validation state when current validation throws', async () => {
      mockValidateFieldValue
        .mockRejectedValueOnce(new Error('Validation failed'))
        .mockResolvedValueOnce({ success: true, data: 'value2' });

      await expect(store.getState().validateForm()).rejects.toThrow(
        'Validation failed',
      );

      expect(store.getState().isValidating).toBe(false);
    });

    it('should handle validation failures', async () => {
      const mockError = new z.core.$ZodError([
        {
          code: 'custom',
          message: 'Field1 is required',
          path: ['field1'],
        },
      ]);
      mockValidateFieldValue
        .mockResolvedValueOnce({
          success: false,
          error: mockError,
        })
        .mockResolvedValueOnce({
          success: true,
          data: 'value2',
        });

      const result = await store.getState().validateForm();
      const state = store.getState();

      expect(result).toBe(false);
      expect(state.isValid).toBe(false);

      const field1 = state.getFieldState('field1');
      const field1Errors = state.getFieldErrors('field1');
      expect(field1Errors).toEqual(['Field1 is required']);
      expect(field1?.meta.isValid).toBe(false);
    });

    it('collects nested custom-schema issues under the registered field', async () => {
      const nestedError = new z.core.$ZodError([
        {
          code: 'custom',
          message: 'Nested label is required',
          path: ['details', 'label'],
        },
      ]);
      mockValidateFieldValue
        .mockResolvedValueOnce({ success: false, error: nestedError })
        .mockResolvedValueOnce({ success: true, data: 'value2' });

      const result = await store.getState().validateForm();

      expect(result).toBe(false);
      expect(store.getState().getFieldErrors('field1')).toEqual([
        'Nested label is required',
      ]);
    });

    it.each(['__proto__', 'constructor', 'prototype'])(
      'stores validation errors for the opaque field %s as own properties',
      async (name) => {
        const prototypeDescriptor = Object.getOwnPropertyDescriptor(
          Object.prototype,
          name,
        );
        store.getState().reset();
        getPathOperations(store).registerField({
          name: [name],
          initialValue: '',
          validation: z.string(),
        });
        const error = new z.core.$ZodError([
          { code: 'custom', message: 'Invalid value', path: [] },
        ]);
        mockValidateFieldValue.mockResolvedValueOnce({
          success: false,
          error,
        });

        const result = await store.getState().validateForm();

        expect(result).toBe(false);
        expect(getPathOperations(store).getFieldErrors([name])).toEqual([
          'Invalid value',
        ]);
        expect(Object.keys(store.getState().errors.fieldErrors)).toContain(
          name,
        );
        expect(Object.getOwnPropertyDescriptor(Object.prototype, name)).toEqual(
          prototypeDescriptor,
        );
      },
    );

    it('should preserve form-level errors when validating fields', async () => {
      // Set form-level errors first
      store.getState().setErrors({
        formErrors: ['Form-level error from server'],
        fieldErrors: {},
      });

      // Validate all fields successfully
      mockValidateFieldValue.mockResolvedValue({
        success: true,
        data: 'valid_value',
      });

      const result = await store.getState().validateForm();
      const state = store.getState();

      // Field validation passed but form-level errors should remain
      expect(result).toBe(true); // validateForm returns true (no field errors)
      expect(state.isValid).toBe(false); // But form is still invalid due to form-level errors
      expect(state.errors.formErrors).toEqual(['Form-level error from server']);
      expect(state.errors.fieldErrors).toEqual({});
    });

    it('should preserve form-level errors when field validation fails', async () => {
      // Set form-level errors first
      store.getState().setErrors({
        formErrors: ['Form-level error'],
        fieldErrors: {},
      });

      // Validate with field errors
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Field error', path: ['field1'] },
      ]);
      mockValidateFieldValue
        .mockResolvedValueOnce({ success: false, error: mockError })
        .mockResolvedValueOnce({ success: true, data: 'value2' });

      await store.getState().validateForm();
      const state = store.getState();

      // Both form-level and field-level errors should exist
      expect(state.errors.formErrors).toEqual(['Form-level error']);
      expect(state.errors.fieldErrors).toHaveProperty('field1');
      expect(state.isValid).toBe(false);
    });

    it('should preserve form-level errors during individual field validation', async () => {
      // Set form-level errors first
      store.getState().setErrors({
        formErrors: ['Server validation error'],
        fieldErrors: { field2: ['Existing field2 error'] },
      });

      // Validate field1 with an error
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Field1 error', path: ['field1'] },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });

      await store.getState().validateField('field1');
      const state = store.getState();

      // Form-level errors should be preserved
      expect(state.errors.formErrors).toEqual(['Server validation error']);
      // Both field errors should exist
      expect(state.errors.fieldErrors.field1).toEqual(['Field1 error']);
      expect(state.errors.fieldErrors.field2).toEqual([
        'Existing field2 error',
      ]);
    });

    it('should keep isValid false when form-level errors exist even if all fields valid', async () => {
      // Set form-level errors
      store.getState().setErrors({
        formErrors: ['Server-side validation error'],
        fieldErrors: {},
      });

      // Validate both fields successfully
      mockValidateFieldValue.mockResolvedValue({
        success: true,
        data: 'valid_value',
      });

      await store.getState().validateField('field1');
      await store.getState().validateField('field2');

      const state = store.getState();

      // All fields are valid
      expect(state.getFieldState('field1')?.meta.isValid).toBe(true);
      expect(state.getFieldState('field2')?.meta.isValid).toBe(true);

      // But form is still invalid due to form-level errors
      expect(state.errors.formErrors).toEqual(['Server-side validation error']);
      expect(state.isValid).toBe(false);
    });

    it('should preserve form-level errors when field validation succeeds', async () => {
      // Set both form-level and field-level errors
      store.getState().setErrors({
        formErrors: ['Form error'],
        fieldErrors: { field1: ['Field1 error'] },
      });

      // Validate field1 successfully (clears field1 error)
      mockValidateFieldValue.mockResolvedValue({
        success: true,
        data: 'valid_value',
      });

      await store.getState().validateField('field1');
      const state = store.getState();

      // Form-level errors should remain
      expect(state.errors.formErrors).toEqual(['Form error']);
      // Field1 error should be cleared
      expect(state.errors.fieldErrors.field1).toBeUndefined();
    });
  });

  describe('Form submission', () => {
    it('should set submitting state', () => {
      store.getState().setSubmitting(true);
      expect(store.getState().isSubmitting).toBe(true);

      store.getState().setSubmitting(false);
      expect(store.getState().isSubmitting).toBe(false);
    });

    describe('submitForm', () => {
      beforeEach(() => {
        // Register a field for testing
        store.getState().registerField({
          name: 'email',
          initialValue: 'test@example.com',
          validation: z.email(),
        });
      });

      it('should submit form successfully when valid', async () => {
        const mockOnSubmit = vi.fn().mockResolvedValue({ success: true });
        const formConfig: FormConfig = {
          onSubmit: mockOnSubmit,
        };

        store.getState().registerForm(formConfig);

        // Mock validation to return success
        mockValidateFieldValue.mockResolvedValue({
          success: true,
          data: 'test@example.com',
        });

        await store.getState().submitForm();

        expect(mockOnSubmit).toHaveBeenCalledWith({
          email: 'test@example.com',
        });
        expect(store.getState().isSubmitting).toBe(false);
        expect(store.getState().errors).toEqual({
          formErrors: [],
          fieldErrors: {},
        });
      });

      it('should submit even if form validation fails (current implementation)', async () => {
        const mockOnSubmit = vi.fn().mockResolvedValue({ success: true });
        const mockOnSubmitInvalid = vi.fn();
        const formConfig: FormConfig = {
          onSubmit: mockOnSubmit,
          onSubmitInvalid: mockOnSubmitInvalid,
        };

        store.getState().registerForm(formConfig);

        // Mock validation to return failure
        const mockError = new z.core.$ZodError([
          { code: 'custom', message: 'Invalid email', path: ['email'] },
        ]);
        mockValidateFieldValue.mockResolvedValue({
          success: false,
          error: mockError,
        });

        await store.getState().submitForm();

        // Current implementation submits regardless of validation state
        expect(mockOnSubmit).toHaveBeenCalled();
        expect(store.getState().isSubmitting).toBe(false);
      });

      it('should handle submission errors', async () => {
        const mockOnSubmit = vi.fn().mockResolvedValue({
          success: false,
          errors: new z.core.$ZodError([
            { code: 'custom', message: 'Server error', path: [] },
          ]),
        });
        const formConfig: FormConfig = {
          onSubmit: mockOnSubmit,
        };

        store.getState().registerForm(formConfig);

        // Mock validation to return success
        mockValidateFieldValue.mockResolvedValue({
          success: true,
          data: 'test@example.com',
        });

        await store.getState().submitForm();

        expect(mockOnSubmit).toHaveBeenCalled();
        expect(store.getState().isSubmitting).toBe(false);
        expect(store.getState().errors).toBeDefined();
      });

      it('should handle submission exceptions', async () => {
        const mockOnSubmit = vi
          .fn()
          .mockRejectedValue(new Error('Network error'));
        const formConfig: FormConfig = {
          onSubmit: mockOnSubmit,
        };

        store.getState().registerForm(formConfig);

        // Mock validation to return success
        mockValidateFieldValue.mockResolvedValue({
          success: true,
          data: 'test@example.com',
        });

        // Expect the promise to be rejected
        await expect(store.getState().submitForm()).rejects.toThrow(
          'Network error',
        );

        expect(mockOnSubmit).toHaveBeenCalled();
      });

      it('should warn when no submit handler is registered', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
          // Mock implementation
        });

        await store.getState().submitForm();

        expect(consoleSpy).toHaveBeenCalledWith('No submit handler registered');
        expect(store.getState().isSubmitting).toBe(false);

        consoleSpy.mockRestore();
      });

      it('should manage submitting state correctly during submission', async () => {
        let submitResolve: (value: unknown) => void;
        const submitPromise = new Promise<unknown>((resolve) => {
          submitResolve = resolve;
        });

        const mockOnSubmit = vi.fn().mockReturnValue(submitPromise);
        const formConfig: FormConfig = {
          onSubmit: mockOnSubmit,
        };

        store.getState().registerForm(formConfig);

        // Mock validation to return success
        mockValidateFieldValue.mockResolvedValue({
          success: true,
          data: 'test@example.com',
        });

        const submitFormPromise = store.getState().submitForm();

        // Note: Current implementation doesn't set submitting state automatically
        // This would need to be done manually before calling submitForm

        // Resolve the submission
        submitResolve!({ success: true });
        await submitFormPromise;

        // Check that submitting is false after submission
        expect(store.getState().isSubmitting).toBe(false);
      });
    });
  });

  describe('Form reset', () => {
    beforeEach(() => {
      store.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
        validation: z.string().check(z.minLength(1, 'Email is required')),
      });
      store.getState().registerField({
        name: 'name',
        initialValue: 'Initial Name',
        validation: z.optional(z.string()),
      });
    });

    it('should reset entire form', async () => {
      // Modify field values and states
      store.getState().setFieldValue('email', 'changed@example.com');

      // Set an error through validation
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Some error', path: ['email'] },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });
      await store.getState().validateField('email');

      store.getState().setFieldTouched('email', true);
      store.getState().setSubmitting(true);

      store.getState().resetForm();
      const state = store.getState();

      expect(state.isSubmitting).toBe(false);
      expect(state.isValidating).toBe(false);
      expect(state.isDirty).toBe(false);
      expect(state.errors).toEqual({ formErrors: [], fieldErrors: {} });
      // Fields with validation start as invalid after reset (need revalidation)
      expect(state.isValid).toBe(false);

      // Verify field states are reset
      const emailField = state.getFieldState('email');
      expect(emailField?.value).toBe('initial@example.com');
      expect(emailField?.meta.isTouched).toBe(false);
      expect(emailField?.meta.isDirty).toBe(false);
      expect(emailField?.meta.isValid).toBe(false); // Has validation, so invalid until validated
    });

    it('should reset individual field', async () => {
      // Modify field
      store.getState().setFieldValue('email', 'changed@example.com');

      // Set an error through validation
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'Some error', path: ['email'] },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });
      await store.getState().validateField('email');

      store.getState().setFieldTouched('email', true);

      store.getState().resetField('email');
      const field = store.getState().getFieldState('email');
      const fieldErrors = store.getState().getFieldErrors('email');

      expect(field?.value).toBe('initial@example.com');
      expect(fieldErrors).toBeNull();
      expect(field?.meta.isTouched).toBe(false);
      expect(field?.meta.isDirty).toBe(false);
      // Fields with validation start as invalid after reset (need revalidation)
      expect(field?.meta.isValid).toBe(false);
      expect(field?.meta.isValidating).toBe(false);
    });

    it('should not error when resetting non-existent field', () => {
      expect(() => {
        store.getState().resetField('nonexistent');
      }).not.toThrow();
    });

    it('should reset to initial state using reset method', () => {
      // Modify some state
      store.getState().registerField({
        name: 'newField',
        validation: z.optional(z.string()),
      });
      store.getState().setSubmitting(true);

      const initialState = store.getInitialState();
      store.getState().reset();
      const currentState = store.getState();

      expect(currentState.fields.size).toBe(initialState.fields.size);
      expect(currentState.isSubmitting).toBe(initialState.isSubmitting);
      expect(currentState.isValidating).toBe(initialState.isValidating);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle operations on non-existent fields gracefully', () => {
      const nonExistentField = 'doesNotExist';

      expect(() => {
        store.getState().setFieldValue(nonExistentField, 'value');
        store.getState().setFieldTouched(nonExistentField, true);
      }).not.toThrow();

      expect(store.getState().fields.has(nonExistentField)).toBe(false);
      expect(store.getState().getFieldState('neverWritten')).toBeUndefined();
    });

    it('should handle Map operations correctly', () => {
      const fieldConfig: FieldConfig = {
        name: 'test',
        initialValue: 'initial',
        validation: z.optional(z.string()),
      };

      store.getState().registerField(fieldConfig);
      expect(store.getState().fields.has('test')).toBe(true);
      expect(store.getState().fields.size).toBe(1);

      store.getState().unregisterField('test');
      expect(store.getState().fields.has('test')).toBe(false);
      expect(store.getState().fields.size).toBe(0);
    });

    it('should maintain field state integrity during concurrent updates', async () => {
      store.getState().registerField({
        name: 'test',
        initialValue: 'initial',
        validation: z.optional(z.string()),
      });

      // Simulate concurrent updates
      store.getState().setFieldValue('test', 'new value');
      store.getState().setFieldTouched('test', true);

      // Set validation error
      const mockError = new z.core.$ZodError([
        { code: 'custom', message: 'validation error', path: [] },
      ]);
      mockValidateFieldValue.mockResolvedValue({
        success: false,
        error: mockError,
      });
      await store.getState().validateField('test');

      const field = store.getState().getFieldState('test');
      const fieldErrors = store.getState().getFieldErrors('test');
      expect(field?.value).toBe('new value');
      expect(field?.meta.isTouched).toBe(true);
      expect(field?.meta.isDirty).toBe(true);
      expect(fieldErrors).toEqual(['validation error']);
      expect(field?.meta.isValid).toBe(false);
    });
  });

  describe('Field value persistence', () => {
    let persistentStore: ReturnType<typeof createFormStore>;

    beforeEach(() => {
      persistentStore = createFormStore();
      vi.clearAllMocks();
    });

    it('should save value to dormantValues when unregistering with persistence enabled', () => {
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      persistentStore.getState().setFieldValue('email', 'changed@example.com');
      persistentStore.getState().unregisterField('email');

      // Field should be removed from active fields
      expect(persistentStore.getState().fields.has('email')).toBe(false);

      // getFieldState returns synthetic state from dormant values
      expect(persistentStore.getState().getFieldState('email')?.value).toBe(
        'changed@example.com',
      );

      // dormantValues should have the value
      expect(persistentStore.getState().dormantValues.get('email')?.value).toBe(
        'changed@example.com',
      );
    });

    it('should restore dormant value when re-registering a field', () => {
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      persistentStore.getState().setFieldValue('email', 'changed@example.com');
      persistentStore.getState().unregisterField('email');

      // Re-register with a different initialValue
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'new-initial@example.com',
      });

      // Should use the dormant value, not the new initialValue
      const field = persistentStore.getState().getFieldState('email');
      expect(field?.value).toBe('changed@example.com');
      expect(field?.meta.isTouched).toBe(true);
      expect(field?.meta.isDirty).toBe(true);
    });

    it('preserves an opaque dotted field path while dormant', () => {
      const path = ['favorite.color'];
      const pathOperations = getPathOperations(persistentStore);
      pathOperations.registerField({
        name: path,
        initialValue: 'blue',
      });
      pathOperations.setFieldValue(path, 'green');
      pathOperations.unregisterField(path);

      expect(persistentStore.getState().getFormValues()).toEqual({});
      expect(pathOperations.getFieldState(path)?.value).toBe('green');

      pathOperations.registerField({
        name: path,
        initialValue: 'red',
      });
      expect(persistentStore.getState().getFormValues()).toEqual({
        'favorite.color': 'green',
      });
    });

    it.each(['favorite.color', 'weight[kg]'])(
      'keeps the public dormant map keyed by %s',
      (name) => {
        const pathOperations = getPathOperations(persistentStore);
        pathOperations.registerField({
          name: [name],
          submissionErrorKey: name,
          initialValue: 'initial',
        });
        pathOperations.setFieldValue([name], 'updated');
        pathOperations.unregisterField([name]);

        expect(persistentStore.getState().dormantValues.get(name)?.value).toBe(
          'updated',
        );
        expect(
          persistentStore.getState().dormantValues.has(`["${name}"]`),
        ).toBe(false);
      },
    );

    it('should remove entry from dormantValues after restoring', () => {
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      persistentStore.getState().setFieldValue('email', 'changed@example.com');
      persistentStore.getState().unregisterField('email');

      expect(persistentStore.getState().dormantValues.has('email')).toBe(true);

      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      expect(persistentStore.getState().dormantValues.has('email')).toBe(false);
    });

    it('should use initialValue when no dormant value exists', () => {
      persistentStore.getState().registerField({
        name: 'newField',
        initialValue: 'fresh-value',
      });

      const field = persistentStore.getState().getFieldState('newField');
      expect(field?.value).toBe('fresh-value');
    });

    it('should always save dormant values when unregistering', () => {
      store.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      store.getState().setFieldValue('email', 'changed@example.com');
      store.getState().unregisterField('email');

      expect(store.getState().dormantValues.get('email')?.value).toBe(
        'changed@example.com',
      );
    });

    it('should clear dormantValues on form reset', () => {
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      persistentStore.getState().setFieldValue('email', 'changed@example.com');
      persistentStore.getState().unregisterField('email');

      expect(persistentStore.getState().dormantValues.size).toBe(1);

      persistentStore.getState().reset();

      expect(persistentStore.getState().dormantValues.size).toBe(0);
    });

    it('should exclude a dormant value from form values', () => {
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      persistentStore.getState().setFieldValue('email', 'changed@example.com');

      expect(persistentStore.getState().getFormValues()).toEqual({
        email: 'changed@example.com',
      });

      persistentStore.getState().unregisterField('email');

      expect(persistentStore.getState().getFormValues()).toEqual({});
    });

    it('should return a restored value in form values after re-registering', () => {
      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      persistentStore.getState().setFieldValue('email', 'changed@example.com');
      persistentStore.getState().unregisterField('email');

      persistentStore.getState().registerField({
        name: 'email',
        initialValue: 'new-initial@example.com',
      });

      expect(persistentStore.getState().getFormValues()).toEqual({
        email: 'changed@example.com',
      });
    });
  });

  describe('Pending writes to unregistered fields', () => {
    it('should store a pending write outside of form values', () => {
      store.getState().setFieldValue('email', 'pending@example.com');

      expect(store.getState().fields.has('email')).toBe(false);
      expect(store.getState().getFieldState('email')?.value).toBe(
        'pending@example.com',
      );
      expect(store.getState().dormantValues.get('email')?.value).toBe(
        'pending@example.com',
      );
      expect(store.getState().getFormValues()).toEqual({});
    });

    it('should prefer a pending write over initialValue when the field registers', () => {
      store.getState().setFieldValue('email', 'pending@example.com');

      store.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
      });

      const field = store.getState().getFieldState('email');
      expect(field?.value).toBe('pending@example.com');
      expect(field?.meta.isTouched).toBe(true);
      expect(field?.meta.isDirty).toBe(true);
      expect(store.getState().dormantValues.has('email')).toBe(false);
      expect(store.getState().getFormValues()).toEqual({
        email: 'pending@example.com',
      });
    });

    it('should mark the form dirty after a pending write', () => {
      expect(store.getState().isDirty).toBe(false);

      store.getState().setFieldValue('email', 'pending@example.com');

      expect(store.getState().isDirty).toBe(true);
    });

    it('should not validate or create errors for a pending write', () => {
      store.getState().setFieldValue('email', 'pending@example.com');

      expect(mockValidateFieldValue).not.toHaveBeenCalled();
      expect(store.getState().errors).toEqual({
        formErrors: [],
        fieldErrors: {},
      });
      expect(store.getState().getFieldErrors('email')).toBeNull();
      expect(store.getState().isValid).toBe(true);
    });

    it('should preserve an existing dormant entry when overwriting its value', () => {
      const validation = z.optional(z.string());
      store.getState().registerField({
        name: 'email',
        initialValue: 'initial@example.com',
        validation,
      });
      store.getState().unregisterField('email');

      store.getState().setFieldValue('email', 'pending@example.com');

      const dormant = store.getState().dormantValues.get('email');
      expect(dormant?.value).toBe('pending@example.com');
      expect(dormant?.initialValue).toBe('initial@example.com');
      expect(dormant?.validation).toBe(validation);
    });
  });
});

/**
 * A message is a claim about one value. Replacing the value ends the claim.
 *
 * The bug this pins: Architect's "create a variable" flow writes the picked
 * variable through `setFieldValue`, and the required-field error raised
 * moments earlier survived the write — the pill showed the chosen variable
 * while the fieldset stayed red and still read "This field is required."
 */
describe('a host write and the errors it supersedes', () => {
  let store: ReturnType<typeof createFormStore>;

  beforeEach(() => {
    store = createFormStore();
    vi.clearAllMocks();
  });

  const registerTwoFields = () => {
    store.getState().registerField({
      name: 'variable',
      initialValue: undefined,
      validation: z.string().check(z.minLength(1, 'This field is required.')),
    });
    store.getState().registerField({
      name: 'prompt',
      initialValue: undefined,
      validation: z.string().check(z.minLength(1, 'This field is required.')),
    });
  };

  const registerVariablePicker = () => {
    registerTwoFields();
    store.getState().setErrors({
      formErrors: [],
      fieldErrors: {
        variable: ['This field is required.'],
        prompt: ['This field is required.'],
      },
    });
  };

  it("drops the written field's messages, and leaves every other field's alone", () => {
    registerVariablePicker();

    store.getState().setFieldValue('variable', 'age');

    expect(store.getState().getFieldErrors('variable')).toBeNull();
    expect(store.getState().getFieldState('variable')?.value).toBe('age');
    // The other field is still wrong, and still says so.
    expect(store.getState().getFieldErrors('prompt')).toEqual([
      'This field is required.',
    ]);
    expect(store.getState().isValid).toBe(false);
  });

  it('drops the messages of a field that is no longer mounted', () => {
    // A collapsed section unmounts its fields while their submit errors live
    // on in the error map — which Architect's Issues panel reads directly, so
    // a survivor here is a row pointing at nothing.
    registerVariablePicker();
    store.getState().unregisterField('variable');
    store.getState().setErrors({
      formErrors: [],
      fieldErrors: { variable: ['This field is required.'] },
    });

    store.getState().setFieldValue('variable', 'age');

    expect(store.getState().errors.fieldErrors).toEqual({});
    expect(store.getState().dormantValues.get('variable')?.value).toBe('age');
  });

  it('does not revalidate the written field: a new problem waits for submit', async () => {
    // The deliberate half of the contract. `useField.handleChange` owns the
    // debounced validate-on-change, so the store must not fire a second one
    // per keystroke — but nothing invalid can slip past, because submit
    // validates every field.
    registerVariablePicker();

    store.getState().setFieldValue('variable', '');

    expect(mockValidateFieldValue).not.toHaveBeenCalled();
    expect(store.getState().getFieldErrors('variable')).toBeNull();

    mockValidateFieldValue.mockResolvedValue({
      success: false,
      error: new z.core.$ZodError([
        { code: 'custom', message: 'This field is required.', path: [] },
      ]),
    });
    await store.getState().validateForm();

    expect(store.getState().getFieldErrors('variable')).toEqual([
      'This field is required.',
    ]);
  });

  it('takes nothing away from a field that has already passed, because typing is a write too', async () => {
    // The other half of the contract, and the one with the blast radius:
    // `useField.handleChange` calls `setFieldValue` on every controlled
    // change, so this path runs per character typed in every fresco-ui form —
    // including the participant-facing ones. `SlidesForm` and `EgoForm` gate
    // "ready to continue" on the form's flag and `QuickAddField` animates its
    // add badge off the field's, so a write that reset the verdict to "not yet
    // checked" would flicker both on every keystroke, for as long as it takes
    // the debounced validation to land.
    registerTwoFields();
    mockValidateFieldValue.mockResolvedValue({ success: true, data: 'age' });
    await store.getState().validateField('variable');
    await store.getState().validateField('prompt');
    expect(store.getState().isValid).toBe(true);

    store.getState().setFieldValue('variable', 'age at diagnosis');

    expect(store.getState().getFieldState('variable')?.meta.isValid).toBe(true);
    expect(store.getState().isValid).toBe(true);
  });
});

/**
 * The field maps are exact-string-keyed and carry no hierarchy, so a form that
 * registers `parameters.type` and `parameters.min` never registers
 * `parameters` — the container exists only in the assembled output. Reading
 * and clearing one are store operations rather than something every host
 * reimplements against the raw maps.
 */
describe('container paths', () => {
  let store: ReturnType<typeof createFormStore>;

  beforeEach(() => {
    store = createFormStore();
    vi.clearAllMocks();
  });

  const registerParameterLeaves = () => {
    store
      .getState()
      .registerField({ name: 'parameters.type', initialValue: 'relative' });
    store.getState().registerField({ name: 'parameters.min', initialValue: 1 });
  };

  /**
   * The mirror image of a container: one field registered at an ANCESTOR
   * path holds values readable at names no field is registered under. The
   * form's own output shows them, so a read of one that answered `undefined`
   * would tell a caller layering live values over committed ones that the
   * form holds nothing there — and it would revive the committed value.
   */
  const registerCompoundParameters = () => {
    store.getState().registerField({
      name: 'parameters',
      initialValue: { type: 'relative', bounds: { min: 1 } },
    });
  };

  describe('reading', () => {
    it('reads a registered leaf by its exact name, unchanged', () => {
      store.getState().registerField({ name: 'label', initialValue: 'Age' });

      expect(store.getState().getValue('label')).toBe('Age');
      expect(store.getState().hasValue('label')).toBe(true);
    });

    it('reads a dormant leaf by its exact name, unchanged', () => {
      store.getState().registerField({ name: 'label', initialValue: 'Age' });
      store.getState().unregisterField('label');

      expect(store.getState().getValue('label')).toBe('Age');
      expect(store.getState().hasValue('label')).toBe(true);
    });

    it('reports nothing for a name the form has never held', () => {
      registerParameterLeaves();

      expect(store.getState().getValue('label')).toBeUndefined();
      expect(store.getState().hasValue('label')).toBe(false);
    });

    it('tells a field holding undefined apart from one that is absent', () => {
      store.getState().registerField({ name: 'label' });

      expect(store.getState().getValue('label')).toBeUndefined();
      expect(store.getState().hasValue('label')).toBe(true);
    });

    it('assembles a container out of the leaves registered beneath it', () => {
      registerParameterLeaves();

      expect(store.getState().getValue('parameters')).toEqual({
        type: 'relative',
        min: 1,
      });
      expect(store.getState().hasValue('parameters')).toBe(true);
    });

    it('assembles array-index leaves as an array', () => {
      store.getState().registerField({ name: 'options[0]', initialValue: 'a' });
      store.getState().registerField({ name: 'options[1]', initialValue: 'b' });

      expect(store.getState().getValue('options')).toEqual(['a', 'b']);
    });

    it('reads a field registered AT the container name as itself', () => {
      // Architect's `CodebookVariableValidationSection` mirrors a committed
      // variable into hidden whole-value fields; a read of `parameters` there
      // is a plain leaf read and stays one.
      store
        .getState()
        .registerField({ name: 'parameters', initialValue: { type: 'exact' } });
      registerParameterLeaves();

      expect(store.getState().getValue('parameters')).toEqual({
        type: 'exact',
      });
    });

    it('contributes only REGISTERED leaves, exactly as getFormValues does', () => {
      registerParameterLeaves();
      store.getState().unregisterField('parameters.min');

      // The form's own output drops the unmounted leaf, so the container read
      // has to drop it too rather than invent a value a submit would not send.
      expect(store.getState().getFormValues()).toEqual({
        parameters: { type: 'relative' },
      });
      expect(store.getState().getValue('parameters')).toEqual({
        type: 'relative',
      });
    });

    it('assembles nothing for a container held only by dormant leaves', () => {
      registerParameterLeaves();
      store.getState().unregisterField('parameters.type');
      store.getState().unregisterField('parameters.min');

      expect(store.getState().getFormValues()).toEqual({});
      expect(store.getState().getValue('parameters')).toBeUndefined();
      // A collapsed section's leaves are still values this form holds — a
      // caller layering live values over committed ones must not read the
      // collapse as "never registered" and revive the committed parameters.
      expect(store.getState().hasValue('parameters')).toBe(true);
    });

    it('does not treat a look-alike opaque name as a descendant', () => {
      // What `Field nameMode="opaque"` registers: ONE segment that happens to
      // contain a dot, published under that same name. Matching on the
      // published name would read it as a leaf of a `parameters` container it
      // has nothing to do with.
      getPathOperations(store).registerField({
        name: ['parameters.type'],
        submissionErrorKey: 'parameters.type',
        initialValue: 'relative',
      });

      expect(store.getState().fields.has('parameters.type')).toBe(true);
      expect(store.getState().hasValue('parameters')).toBe(false);
      expect(store.getState().getValue('parameters')).toBeUndefined();
    });

    it('returns the same container object while nothing beneath it changes', () => {
      registerParameterLeaves();
      store.getState().registerField({ name: 'label', initialValue: 'Age' });

      const first = store.getState().getValue('parameters');
      store.getState().setFieldValue('label', 'Age at diagnosis');

      expect(store.getState().getValue('parameters')).toBe(first);
    });

    it('returns a new container object when a leaf beneath it changes', () => {
      registerParameterLeaves();

      const first = store.getState().getValue('parameters');
      store.getState().setFieldValue('parameters.min', 2);
      const second = store.getState().getValue('parameters');

      expect(second).not.toBe(first);
      expect(second).toEqual({ type: 'relative', min: 2 });
    });

    it('starts a container over after a reset', () => {
      registerParameterLeaves();
      const first = store.getState().getValue('parameters');

      store.getState().reset();
      expect(store.getState().getValue('parameters')).toBeUndefined();

      registerParameterLeaves();
      expect(store.getState().getValue('parameters')).toEqual(first);
      expect(store.getState().getValue('parameters')).not.toBe(first);
    });

    it('reads a sub-path out of a field registered above it', () => {
      registerCompoundParameters();

      expect(store.getState().getFormValues()).toEqual({
        parameters: { type: 'relative', bounds: { min: 1 } },
      });
      expect(store.getState().getValue('parameters.type')).toBe('relative');
      expect(store.getState().hasValue('parameters.type')).toBe(true);
    });

    it('reads an object-valued sub-path out of a field registered above it', () => {
      registerCompoundParameters();

      expect(store.getState().getValue('parameters.bounds')).toEqual({
        min: 1,
      });
      expect(store.getState().hasValue('parameters.bounds')).toBe(true);
    });

    it('reads a sub-path the ancestor covers but does not currently carry', () => {
      registerCompoundParameters();

      // The form owns the whole subtree, so a key missing from it is a value
      // the person has emptied rather than one the form has yet to hold.
      expect(store.getState().getValue('parameters.max')).toBeUndefined();
      expect(store.getState().hasValue('parameters.max')).toBe(true);
    });

    it('holds a sub-path read stable while nothing beneath the ancestor changes', () => {
      registerCompoundParameters();
      store.getState().registerField({ name: 'label', initialValue: 'Age' });

      const first = store.getState().getValue('parameters.bounds');
      store.getState().setFieldValue('label', 'Age at diagnosis');

      expect(first).toEqual({ min: 1 });
      expect(store.getState().getValue('parameters.bounds')).toBe(first);
    });

    it('reads a sub-path past a leaf registered elsewhere under the same ancestor', () => {
      registerCompoundParameters();
      // `getFormValues` replays the more specific field over the compound one,
      // rebuilding the object it sits in; the read still resolves and still
      // holds its identity.
      store
        .getState()
        .registerField({ name: 'parameters.type', initialValue: 'absolute' });

      const first = store.getState().getValue('parameters.bounds');

      expect(first).toEqual({ min: 1 });
      expect(store.getState().getValue('parameters.type')).toBe('absolute');
      expect(store.getState().getValue('parameters.bounds')).toBe(first);
    });

    it('reads a field registered AT the sub-path name as itself', () => {
      registerCompoundParameters();
      store
        .getState()
        .registerField({ name: 'parameters.type', initialValue: 'absolute' });

      expect(store.getState().getValue('parameters.type')).toBe('absolute');
    });

    it('takes the registered ancestor over a dormant field at the name', () => {
      registerCompoundParameters();
      store
        .getState()
        .registerField({ name: 'parameters.type', initialValue: 'absolute' });
      store.getState().unregisterField('parameters.type');

      // Same ordering the container read uses, and for the same reason: the
      // unmounted leaf is gone from `getFormValues`, so a read that preferred
      // it would answer with a value a submit would not send.
      expect(store.getState().getValue('parameters.type')).toBe('relative');
    });

    it('reads nothing through an ancestor that has unmounted', () => {
      registerCompoundParameters();
      store.getState().unregisterField('parameters');

      // A dormant field contributes nothing to `getFormValues`, so there is no
      // assembled object to read a sub-path out of — and the name itself is
      // one the form has never held a field at.
      expect(store.getState().getValue('parameters.type')).toBeUndefined();
      expect(store.getState().hasValue('parameters.type')).toBe(false);
    });
  });

  describe('clearing', () => {
    it('clears every registered leaf beneath the container', () => {
      registerParameterLeaves();

      store.getState().clearValue('parameters');

      expect(
        store.getState().getFieldState('parameters.type')?.value,
      ).toBeUndefined();
      expect(
        store.getState().getFieldState('parameters.min')?.value,
      ).toBeUndefined();
      expect(store.getState().getValue('parameters')).toStrictEqual({
        type: undefined,
        min: undefined,
      });
    });

    it('clears dormant leaves too, so an unmounted one cannot come back', () => {
      registerParameterLeaves();
      // A collapsed section parks its value dormant, and a dormant value
      // outranks `initialValue` when the field next registers.
      store.getState().unregisterField('parameters.min');

      store.getState().clearValue('parameters');

      expect(
        store.getState().dormantValues.get('parameters.min')?.value,
      ).toBeUndefined();
      store
        .getState()
        .registerField({ name: 'parameters.min', initialValue: 1 });
      expect(
        store.getState().getFieldState('parameters.min')?.value,
      ).toBeUndefined();
    });

    it('clears array-index leaves beneath the container', () => {
      store.getState().registerField({ name: 'options[0]', initialValue: 'a' });
      store.getState().registerField({ name: 'options[1]', initialValue: 'b' });
      store.getState().unregisterField('options[1]');

      store.getState().clearValue('options');

      expect(
        store.getState().getFieldState('options[0]')?.value,
      ).toBeUndefined();
      expect(
        store.getState().dormantValues.get('options[1]')?.value,
      ).toBeUndefined();
    });

    it('clears the container name itself, for a value really held as one field', () => {
      store
        .getState()
        .registerField({ name: 'parameters', initialValue: { type: 'exact' } });

      store.getState().clearValue('parameters');

      expect(
        store.getState().getFieldState('parameters')?.value,
      ).toBeUndefined();
    });

    it('leaves the container readable through its leaves afterwards', () => {
      // Clearing parks a dormant `undefined` at the container's own name.
      // Architect swaps input controls this way — clear, then mount the new
      // control's leaves — so a shadow left at that name would make every
      // later read of the container answer `undefined`.
      registerParameterLeaves();
      store.getState().clearValue('parameters');

      store.getState().setFieldValue('parameters.type', 'absolute');

      expect(store.getState().dormantValues.has('parameters')).toBe(true);
      expect(store.getState().getValue('parameters')).toStrictEqual({
        type: 'absolute',
        min: undefined,
      });
    });

    it('leaves fields outside the container alone', () => {
      registerParameterLeaves();
      store.getState().registerField({ name: 'label', initialValue: 'Age' });
      store
        .getState()
        .registerField({ name: 'parametersExtra', initialValue: 'kept' });

      store.getState().clearValue('parameters');

      expect(store.getState().getFieldState('label')?.value).toBe('Age');
      expect(store.getState().getFieldState('parametersExtra')?.value).toBe(
        'kept',
      );
    });

    it('clears a sub-path out of the field registered above it', () => {
      registerCompoundParameters();

      store.getState().clearValue('parameters.type');

      // Parking an `undefined` at the name alone clears nothing: the read
      // takes the registered ancestor over a dormant field at the name, so
      // the value would still read back — and still submit.
      expect(store.getState().getValue('parameters.type')).toBeUndefined();
      expect(store.getState().getFormValues()).toStrictEqual({
        parameters: { bounds: { min: 1 } },
      });
      expect(store.getState().getFieldState('parameters')?.value).toStrictEqual(
        { bounds: { min: 1 } },
      );
    });

    it('drops the cleared key rather than parking an `undefined` under it', () => {
      registerCompoundParameters();

      store.getState().clearValue('parameters.type');

      // A key still present holding `undefined` is a key the submitted output
      // carries, and a protocol written from that output carries it too.
      const values = store.getState().getFormValues();
      expect(Object.keys(values.parameters ?? {})).toStrictEqual(['bounds']);
    });

    it('clears a nested sub-path without editing the value the ancestor held', () => {
      const registeredValue = { type: 'relative', bounds: { min: 1 } };
      store
        .getState()
        .registerField({ name: 'parameters', initialValue: registeredValue });

      store.getState().clearValue('parameters.bounds.min');

      // Every container along the way is rebuilt, so the object the field
      // registered with — the one a host may still be holding — is intact.
      expect(registeredValue).toStrictEqual({
        type: 'relative',
        bounds: { min: 1 },
      });
      expect(store.getState().getFieldState('parameters')?.value).toStrictEqual(
        { type: 'relative', bounds: {} },
      );
      expect(
        store.getState().getValue('parameters.bounds.min'),
      ).toBeUndefined();
    });

    it('clears a sub-path beneath an array the ancestor holds, as an array', () => {
      store.getState().registerField({
        name: 'items',
        initialValue: [{ x: 1, y: 2 }, { x: 3 }],
      });

      store.getState().clearValue('items[0].x');

      expect(store.getState().getFormValues()).toStrictEqual({
        items: [{ y: 2 }, { x: 3 }],
      });
    });

    it('holds the position of a cleared array element open', () => {
      store
        .getState()
        .registerField({ name: 'items', initialValue: ['a', 'b'] });

      store.getState().clearValue('items[1]');

      // The indices around it are positions other names address, so closing
      // the gap would silently renumber them.
      expect(store.getState().getFormValues()).toStrictEqual({
        items: ['a', undefined],
      });
      expect(store.getState().getValue('items[0]')).toBe('a');
    });

    it('clears out of the NEAREST registered ancestor, not the outermost', () => {
      store.getState().registerField({
        name: 'parameters',
        initialValue: { bounds: { min: 1, max: 5 } },
      });
      store.getState().registerField({
        name: 'parameters.bounds',
        initialValue: { min: 2, max: 6 },
      });

      store.getState().clearValue('parameters.bounds.min');

      // `getFormValues` replays the deeper field OVER the compound one, so
      // the deeper field is the one the name reads its value out of — and
      // clearing the outer one would leave the read answering as it did.
      expect(
        store.getState().getValue('parameters.bounds.min'),
      ).toBeUndefined();
      expect(
        store.getState().getFieldState('parameters.bounds')?.value,
      ).toStrictEqual({ max: 6 });
      expect(store.getState().getFieldState('parameters')?.value).toStrictEqual(
        { bounds: { min: 1, max: 5 } },
      );
    });

    it('leaves an ancestor holding no object at the sub-path exactly as it was', () => {
      store
        .getState()
        .registerField({ name: 'parameters', initialValue: 'exact' });

      store.getState().clearValue('parameters.type');

      expect(store.getState().getFieldState('parameters')?.value).toBe('exact');
      expect(store.getState().getFieldState('parameters')?.meta.isDirty).toBe(
        false,
      );
    });

    it('leaves an ancestor carrying nothing at the sub-path exactly as it was', () => {
      registerCompoundParameters();
      const before = store.getState().getFieldState('parameters')?.value;

      store.getState().clearValue('parameters.max');

      expect(store.getState().getFieldState('parameters')?.value).toBe(before);
      expect(store.getState().getFieldState('parameters')?.meta.isDirty).toBe(
        false,
      );
    });

    it('leaves the ancestor alone when a field is registered at the name itself', () => {
      registerCompoundParameters();
      store
        .getState()
        .registerField({ name: 'parameters.type', initialValue: 'absolute' });

      store.getState().clearValue('parameters.type');

      // `getFormValues` replays the more specific field OVER the compound
      // one, so clearing that field is the whole answer; rewriting the
      // ancestor as well would only rebuild a value the replay covers.
      expect(store.getState().getValue('parameters.type')).toBeUndefined();
      expect(store.getState().getFieldState('parameters')?.value).toStrictEqual(
        { type: 'relative', bounds: { min: 1 } },
      );
    });

    it('clears through the ancestor for a field that has unmounted at the name', () => {
      registerCompoundParameters();
      store
        .getState()
        .registerField({ name: 'parameters.type', initialValue: 'absolute' });
      store.getState().unregisterField('parameters.type');

      store.getState().clearValue('parameters.type');

      // An unmounted field contributes nothing to `getFormValues`, so the
      // ancestor is the only place the name is still held.
      expect(store.getState().getValue('parameters.type')).toBeUndefined();
      expect(store.getState().getFormValues()).toStrictEqual({
        parameters: { bounds: { min: 1 } },
      });
    });

    it('clears an opaque field named by the dotted name it publishes', () => {
      // What `Field nameMode="opaque"` registers: ONE segment that happens to
      // contain a dot. Reading that name structurally writes an `undefined`
      // at a nested name nothing is registered under, and leaves the field it
      // actually names holding its value — readable, and still submitted.
      getPathOperations(store).registerField({
        name: ['favorite.color'],
        submissionErrorKey: 'favorite.color',
        initialValue: 'blue',
      });

      store.getState().clearValue('favorite.color');

      expect(
        getPathOperations(store).getFieldState(['favorite.color'])?.value,
      ).toBeUndefined();
      expect(store.getState().getFormValues()).toStrictEqual({
        'favorite.color': undefined,
      });
      expect(store.getState().dormantValues.size).toBe(0);
    });

    it('does not write past an opaque name into the container it reads like', () => {
      getPathOperations(store).registerField({
        name: ['favorite.color'],
        submissionErrorKey: 'favorite.color',
        initialValue: 'blue',
      });
      store
        .getState()
        .registerField({ name: 'favorite.shape', initialValue: 'round' });

      store.getState().clearValue('favorite.color');

      expect(store.getState().getFormValues()).toStrictEqual({
        'favorite.color': undefined,
        'favorite': { shape: 'round' },
      });
    });

    it('clears an opaque alias that only looks like an unsafe path', () => {
      getPathOperations(store).registerField({
        name: ['safe.__proto__.polluted'],
        submissionErrorKey: 'safe.__proto__.polluted',
        initialValue: 'preserved',
      });

      store.getState().clearValue('safe.__proto__.polluted');

      expect(
        store.getState().getFieldState('safe.__proto__.polluted')?.value,
      ).toBeUndefined();
      expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    });

    it('sweeps no structural subtree beneath an opaque name', () => {
      getPathOperations(store).registerField({
        name: ['favorite.color'],
        submissionErrorKey: 'favorite.color',
        initialValue: 'blue',
      });
      store
        .getState()
        .registerField({ name: 'favorite.color.shade', initialValue: 'dark' });

      store.getState().clearValue('favorite.color');

      // The opaque name is ONE segment, so the leaf beneath the structural
      // `favorite.color` sits in a container the opaque field has nothing to
      // do with — the same reading `hasValue` gives such a name.
      expect(
        store.getState().getFieldState('favorite.color.shade')?.value,
      ).toBe('dark');
      expect(store.getState().getFormValues()).toStrictEqual({
        'favorite.color': undefined,
        'favorite': { color: { shade: 'dark' } },
      });
    });

    it('takes a structural field at the name over an opaque alias, as every read does', () => {
      getPathOperations(store).registerField({
        name: ['favorite.color'],
        submissionErrorKey: 'favorite.color',
        initialValue: 'blue',
      });
      store
        .getState()
        .registerField({ name: 'favorite.color', initialValue: 'green' });

      store.getState().clearValue('favorite.color');

      expect(
        store.getState().getFieldState('favorite.color')?.value,
      ).toBeUndefined();
      expect(
        getPathOperations(store).getFieldState(['favorite.color'])?.value,
      ).toBe('blue');
    });
  });
});
