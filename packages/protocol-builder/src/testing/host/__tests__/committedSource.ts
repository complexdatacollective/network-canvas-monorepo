import { createHash } from 'node:crypto';

/**
 * The name a host has to commit these bytes under: their SHA-256, and the
 * extension of the file the researcher picked.
 *
 * Worked out here, from the bytes and Node's own digest, rather than read back
 * off the host — a host still keying committed bytes by the caller's filename
 * fails this instead of agreeing with itself.
 */
export function committedSource(bytes: Uint8Array, source: string): string {
  const digest = createHash('sha256').update(bytes).digest('hex');
  const dot = source.lastIndexOf('.');
  return `${digest}${dot > 0 ? source.slice(dot).toLowerCase() : ''}`;
}
