// Prints the @codaco/interview "release version" that keys interface-image
// regeneration: its package.json version, plus a short fingerprint of any
// pending changeset that bumps @codaco/interview. Versioning the package — or
// adding such a changeset — changes this value, which is the deliberate signal
// that the interface screenshots should be regenerated and their consumers
// (architect-web, documentation) redeployed. Arbitrary interview/fresco-ui
// edits do NOT change it. Passed to turbo as INTERVIEW_RELEASE_VERSION.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const version = JSON.parse(
  readFileSync(join(root, 'packages/interview/package.json'), 'utf8'),
).version;

let fingerprint = '';
const changesetDir = join(root, '.changeset');
if (existsSync(changesetDir)) {
  const hash = createHash('sha256');
  let pending = false;
  const files = readdirSync(changesetDir)
    .filter((f) => f.endsWith('.md'))
    .toSorted();
  for (const file of files) {
    const body = readFileSync(join(changesetDir, file), 'utf8');
    if (body.includes('@codaco/interview')) {
      pending = true;
      hash.update(file);
      hash.update(body);
    }
  }
  if (pending) fingerprint = `+cs.${hash.digest('hex').slice(0, 12)}`;
}

process.stdout.write(version + fingerprint);
