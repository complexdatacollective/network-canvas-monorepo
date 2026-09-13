import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalize } from '../../../../packages/studio-sync/src/apply.ts';
import { runMonthAuthorizationTool } from './observability-anchor-operator.mjs';
import {
  createMonthAuthorizationVerifier,
  rawEd25519PublicKey,
  signMonthAuthorization,
} from './observability-month-authorization.mjs';

const now = Date.parse('2026-09-13T12:05:00.000Z');
const account = 'a'.repeat(64);
const previous = { stateSha256: 'b'.repeat(64) };
const next = { monthUtc: '2026-10', stateSha256: 'c'.repeat(64) };

function keys() {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' });
  return {
    privatePem,
    publicKey: rawEd25519PublicKey(privatePem),
  };
}

function approval(overrides = {}) {
  return {
    accountIdentitySha256: account,
    previousStateSha256: previous.stateSha256,
    nextStateSha256: next.stateSha256,
    targetMonthUtc: next.monthUtc,
    issuedAt: '2026-09-13T12:00:00.000Z',
    expiresAt: '2026-09-13T12:15:00.000Z',
    ...overrides,
  };
}

function receipt(key, overrides = {}) {
  return signMonthAuthorization({
    approval: approval(overrides),
    authorityKeyId: 'month-authority-1',
    key: key.privatePem,
    now,
  });
}

function verifier(key, overrides = {}) {
  return createMonthAuthorizationVerifier({
    accountIdentitySha256: account,
    authorityKeyId: 'month-authority-1',
    authorityPublicKey: key.publicKey,
    now: () => now,
    ...overrides,
  });
}

test('accepts one short-lived signature for the exact account, lineage states, and UTC month', async () => {
  const key = keys();
  assert.equal(
    await verifier(key)({
      authorization: canonicalize(receipt(key)),
      previous,
      next,
      signal: new AbortController().signal,
    }),
    true,
  );
});

test('rejects wrong account, state, month, key, expiry, and tampering', async () => {
  const key = keys();
  const other = keys();
  const valid = receipt(key);
  const cases = [
    {
      verify: verifier(key, { accountIdentitySha256: 'd'.repeat(64) }),
      value: valid,
    },
    {
      verify: verifier(key),
      value: receipt(key, { previousStateSha256: 'd'.repeat(64) }),
    },
    {
      verify: verifier(key),
      value: receipt(key, { nextStateSha256: 'd'.repeat(64) }),
    },
    {
      verify: verifier(key),
      value: receipt(key, { targetMonthUtc: '2026-11' }),
    },
    { verify: verifier(other), value: valid },
    {
      verify: createMonthAuthorizationVerifier({
        accountIdentitySha256: account,
        authorityKeyId: 'month-authority-1',
        authorityPublicKey: key.publicKey,
        now: () => Date.parse('2026-09-13T12:15:00.000Z'),
      }),
      value: valid,
    },
    {
      verify: verifier(key),
      value: {
        ...valid,
        approval: { ...valid.approval, expiresAt: '2026-09-13T12:14:59.000Z' },
      },
    },
  ];
  for (const item of cases)
    assert.equal(
      await item.verify({
        authorization: canonicalize(item.value),
        previous,
        next,
        signal: new AbortController().signal,
      }),
      false,
    );
  assert.equal(
    await verifier(key)({
      authorization: JSON.stringify(valid),
      previous,
      next,
      signal: new AbortController().signal,
    }),
    false,
  );
  assert.throws(
    () => receipt(key, { expiresAt: '2026-09-13T12:15:00.001Z' }),
    /ANCHOR_MONTH_AUTHORIZATION_INPUT_INVALID/,
  );
});

test('offline issuance requires private regular inputs and exclusive private output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-anchor-approval-'));
  const input = join(root, 'approval.json');
  const keyPath = join(root, 'authority.pem');
  const output = join(root, 'authorization.json');
  const linked = join(root, 'linked.json');
  const key = keys();
  await writeFile(input, canonicalize(approval()), { mode: 0o600 });
  await writeFile(keyPath, key.privatePem, { mode: 0o600 });
  assert.match(
    await runMonthAuthorizationTool(
      ['issue', input, keyPath, 'month-authority-1', output],
      now,
    ),
    /"targetMonthUtc":"2026-10"/,
  );
  const issued = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(
    await verifier(key)({
      authorization: canonicalize(issued),
      previous,
      next,
      signal: new AbortController().signal,
    }),
    true,
  );
  await assert.rejects(
    () =>
      runMonthAuthorizationTool(
        ['issue', input, keyPath, 'month-authority-1', output],
        now,
      ),
    /ANCHOR_MONTH_AUTHORIZATION_TOOL_FAILED/,
  );
  await symlink(input, linked);
  await assert.rejects(
    () =>
      runMonthAuthorizationTool(
        ['issue', linked, keyPath, 'month-authority-1', join(root, 'other')],
        now,
      ),
    /ANCHOR_MONTH_AUTHORIZATION_TOOL_FAILED/,
  );
  await chmod(input, 0o644);
  await assert.rejects(
    () =>
      runMonthAuthorizationTool(
        ['issue', input, keyPath, 'month-authority-1', join(root, 'public')],
        now,
      ),
    /ANCHOR_MONTH_AUTHORIZATION_TOOL_FAILED/,
  );
  await chmod(input, 0o600);
  await writeFile(
    input,
    `{"accountIdentitySha256":"${account}","accountIdentitySha256":"${'d'.repeat(64)}"}`,
  );
  await assert.rejects(
    () =>
      runMonthAuthorizationTool(
        ['issue', input, keyPath, 'month-authority-1', join(root, 'duplicate')],
        now,
      ),
    /ANCHOR_MONTH_AUTHORIZATION_TOOL_FAILED/,
  );
});
