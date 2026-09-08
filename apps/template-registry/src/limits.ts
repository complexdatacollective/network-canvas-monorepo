import { z } from 'zod';

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const RegistryLimitsSchema = z.strictObject({
  publisherBytes: positive,
  totalBytes: positive,
  publishPerHour: positive,
  publishGlobalPerMinute: positive,
  reportsPerHour: positive,
  reportsPerEntryPerHour: positive,
  accountWritesPerHour: positive,
  accountWritesGlobalPerHour: positive,
});
export type RegistryLimits = z.infer<typeof RegistryLimitsSchema>;

export const DEFAULT_REGISTRY_LIMITS: RegistryLimits = {
  publisherBytes: 100 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024,
  publishPerHour: 30,
  publishGlobalPerMinute: 10,
  reportsPerHour: 100,
  reportsPerEntryPerHour: 10,
  accountWritesPerHour: 30,
  accountWritesGlobalPerHour: 120,
};
