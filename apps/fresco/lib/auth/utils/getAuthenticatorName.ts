import aaguidNames from './aaguid-names.json';

const registry: Readonly<Record<string, string>> = aaguidNames;

export function getAuthenticatorName(aaguid: string): string | null {
  // Unknown authenticators use their existing deviceType at display time.
  // Persisting a generated English name would make it indistinguishable from data.
  return registry[aaguid] ?? null;
}
