import { v4 as uuid } from 'uuid';

export function createUuid(): string {
  // Passing options bypasses randomUUID(), which is unavailable on supported
  // plain-HTTP self-hosts, while retaining getRandomValues() entropy.
  return uuid({});
}
