import { createHash } from 'node:crypto';

/** Bind bytes read through a release candidate to its regular committed blob. */
export function readCommittedFile(candidate, path) {
  const matches = candidate.files.filter((file) => file.path === path);
  if (matches.length !== 1 || matches[0].mode !== '100644')
    throw new Error('Expected one regular committed release file.');
  const bytes = Buffer.from(candidate.read(path));
  const oid = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  if (oid !== matches[0].oid)
    throw new Error('Release content does not match its committed Git blob.');
  return bytes;
}
