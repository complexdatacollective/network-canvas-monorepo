import { describe, expect, it } from 'vitest';

import {
  MigrationError,
  MigrationNotPossibleError,
  MigrationStepError,
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from '../errors.ts';

describe('Migration Errors', () => {
  it.each([
    {
      error: new MigrationError('Something went wrong'),
      name: 'MigrationError',
      message: 'Something went wrong',
    },
    {
      error: new MigrationNotPossibleError(6, 8),
      name: 'MigrationNotPossibleError',
      message: 'Migration to this version is not possible (6 -> 8).',
    },
    {
      error: new VersionMismatchError(8, 7),
      name: 'VersionMismatchError',
      message:
        'Nonsensical migration path (8 -> 7). Source version must be lower than target version.',
    },
    {
      error: new MigrationStepError(7),
      name: 'MigrationStepError',
      message: 'Migration step failed at version 7.',
    },
    {
      error: new SchemaVersionDetectionError(),
      name: 'SchemaVersionDetectionError',
      message: 'Unable to detect schema version from document',
    },
    {
      error: new ValidationError('Invalid protocol structure', 8),
      name: 'ValidationError',
      message: 'Validation failed for version 8: Invalid protocol structure',
    },
    {
      error: new ValidationError('Invalid protocol structure'),
      name: 'ValidationError',
      message: 'Validation failed: Invalid protocol structure',
    },
  ])(
    '$name is a MigrationError with the message "$message"',
    ({ error, name, message }) => {
      expect(error).toBeInstanceOf(MigrationError);
      expect(error.name).toBe(name);
      expect(error.message).toBe(message);
    },
  );
});
