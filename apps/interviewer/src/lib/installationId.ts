import { v4 as uuid } from 'uuid';

const STORAGE_KEY = 'interviewer:installation-id';

export function getInstallationId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = uuid();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return 'anonymous';
  }
}
