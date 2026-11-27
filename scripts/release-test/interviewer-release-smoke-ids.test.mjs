import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import { readSmokeIds } from './interviewer-release-smoke-ids.mjs';

const fixture = () =>
  JSON.parse(
    readFileSync('packages/protocols/e2e/release-smoke/protocol.json', 'utf8'),
  );

test('the smoke walker reads every id it needs from the release-smoke protocol', () => {
  const document = fixture();
  const ids = readSmokeIds(document);
  const [layoutId] = Object.entries(document.codebook.layouts).find(
    ([, layout]) => layout.name === 'layout',
  );
  assert.equal(ids.person.layout, layoutId);
  const stages = document.stages.filter(({ type }) => type === 'Sociogram');
  assert.ok(
    stages.some(({ layout }) => layout === ids.person.layout),
    'a Sociogram places people in the layout the walker reads positions from',
  );
  for (const value of [
    ids.person.id,
    ids.person.name,
    ids.person.context,
    ids.person.closeness,
    ids.familyMember.id,
    ids.knows,
    ids.friends,
    ids.familyEdge.id,
    ids.ego.ego_name,
    ids.ego.consent,
  ]) {
    assert.equal(typeof value, 'string');
  }
});
