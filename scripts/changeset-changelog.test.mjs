import assert from 'node:assert/strict';
import { test } from 'node:test';

import changelog, { getDependencyReleaseLine } from './changeset-changelog.mjs';

const firstCommit = '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const secondCommit = '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const commitUrl =
  'https://github.com/complexdatacollective/network-canvas-monorepo/commit/';

test('groups dependency changes into one item with unique commit links', () => {
  const line = getDependencyReleaseLine(
    [
      { commit: firstCommit },
      { commit: secondCommit },
      { commit: firstCommit },
    ],
    [
      { name: '@codaco/fresco-ui', newVersion: '6.1.0' },
      { name: '@codaco/interview', newVersion: '9.0.0' },
    ],
  );

  assert.equal(
    line,
    `- Updated dependencies ([1111111](${commitUrl}${firstCommit}), [2222222](${commitUrl}${secondCommit}))
  - @codaco/fresco-ui@6.1.0
  - @codaco/interview@9.0.0`,
  );
});

test('keeps a single dependency item when commit metadata is unavailable', () => {
  assert.equal(
    getDependencyReleaseLine(
      [{ commit: undefined }],
      [{ name: '@codaco/shared-consts', newVersion: '6.0.0' }],
    ),
    `- Updated dependencies
  - @codaco/shared-consts@6.0.0`,
  );
});

test('omits the dependency item when no dependencies changed', () => {
  assert.equal(getDependencyReleaseLine([{ commit: firstCommit }], []), '');
});

test('retains the standard formatter for direct release notes', () => {
  assert.equal(
    changelog.getReleaseLine({
      commit: firstCommit,
      summary: 'Describe the direct change.',
    }),
    '- 1111111: Describe the direct change.',
  );
});
