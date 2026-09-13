// The release-test bundler decides which of Fresco's workspace packages the
// staged image installs from local tarballs and which from npm. Its rule is
// `changeset publish`'s: everything the publish run ships — planned bumps and
// versions npm does not have yet — is vendored; everything else resolves from
// the registry, as the released image will.
import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  partitionClosure,
  unpublishedAtCurrentVersion,
} from '../../apps/fresco/release-test/scripts/bundle-pending-packages.mjs';
import { readWorkspacePackages } from '../release/resolve-manifest.mjs';
import { collectClosure } from '../release/vendor-workspace-packages.mjs';

const WS = {
  '@codaco/app-i18n': { version: '0.1.0', private: false },
  '@codaco/interview': { version: '9.0.1', private: false },
  '@codaco/shared-consts': { version: '6.0.0', private: false },
};

function stubFetch(statusByUrl, calls = []) {
  return async (url) => {
    calls.push(String(url));
    const status = statusByUrl[String(url)];
    if (status === undefined) throw new Error(`unexpected fetch ${url}`);
    if (status instanceof Error) throw status;
    return { status };
  };
}

test("Fresco's closure reaches @codaco/app-i18n, directly and through the interview runtime", () => {
  const closure = collectClosure(readWorkspacePackages(), 'apps/fresco');
  assert.ok(closure.includes('@codaco/app-i18n'), closure.join(', '));
  assert.ok(closure.includes('@codaco/interview'), closure.join(', '));
});

test('a closure package whose current version npm lacks is unpublished; a present one is not', async () => {
  const calls = [];
  const unpublished = await unpublishedAtCurrentVersion(
    ['@codaco/app-i18n', '@codaco/shared-consts'],
    WS,
    {
      fetchImpl: stubFetch(
        {
          'https://registry.npmjs.org/@codaco%2Fapp-i18n/0.1.0': 404,
          'https://registry.npmjs.org/@codaco%2Fshared-consts/6.0.0': 200,
        },
        calls,
      ),
    },
  );
  assert.deepEqual(unpublished, ['@codaco/app-i18n']);
  assert.deepEqual(calls, [
    'https://registry.npmjs.org/@codaco%2Fapp-i18n/0.1.0',
    'https://registry.npmjs.org/@codaco%2Fshared-consts/6.0.0',
  ]);
});

test('an indefinite registry answer refuses rather than guessing either way', async () => {
  const url = 'https://registry.npmjs.org/@codaco%2Fapp-i18n/0.1.0';
  await assert.rejects(
    unpublishedAtCurrentVersion(['@codaco/app-i18n'], WS, {
      fetchImpl: stubFetch({ [url]: 502 }),
    }),
    /Could not check whether @codaco\/app-i18n@0\.1\.0 is on npm: registry returned HTTP 502/,
  );
  await assert.rejects(
    unpublishedAtCurrentVersion(['@codaco/app-i18n'], WS, {
      fetchImpl: stubFetch({ [url]: new Error('ENOTFOUND') }),
    }),
    /Could not check whether @codaco\/app-i18n@0\.1\.0 is on npm: ENOTFOUND/,
  );
});

test('the 2026-09-08 case: an unplanned first publication is vendored, not left to the registry', () => {
  const closure = [
    '@codaco/app-i18n',
    '@codaco/interview',
    '@codaco/shared-consts',
  ];
  const { vendored, registry } = partitionClosure({
    closure,
    planned: new Map([['@codaco/interview', '9.1.0']]),
    unpublished: ['@codaco/app-i18n'],
  });
  assert.deepEqual(vendored, ['@codaco/app-i18n', '@codaco/interview']);
  assert.deepEqual(registry, ['@codaco/shared-consts']);
});

test('with nothing planned or unpublished the whole closure resolves from the registry', () => {
  const closure = ['@codaco/interview', '@codaco/shared-consts'];
  assert.deepEqual(
    partitionClosure({ closure, planned: new Map(), unpublished: [] }),
    { vendored: [], registry: closure },
  );
});
