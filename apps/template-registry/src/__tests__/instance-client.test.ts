import { afterEach, beforeEach, expect, it } from 'vitest';

import { templateBytesHash } from '@codaco/studio-sync/template-exchange';
import { TemplateRegistryClient } from '@codaco/studio-sync/template-registry-client';

import {
  createRegistryFixture,
  ORIGIN,
  template,
  type RegistryFixture,
} from './fixtures.ts';

let fixture: RegistryFixture;

beforeEach(async () => {
  fixture = await createRegistryFixture();
});

afterEach(async () => {
  await fixture?.dispose();
});

it('publishes, reads metadata and verifies the artifact against the actual Registry service', async () => {
  const account = await fixture.account('instance-client@example.test');
  const built = await template('Instance client template');
  const client = new TemplateRegistryClient({
    origin: ORIGIN,
    fetch: async (input, init) => await fixture.app.request(input, init),
  });

  const published = await client.publish(built.bytes, account.token);
  const metadata = await client.entry(published.id);
  const fetched = await client.fetchArtifact(metadata.root);

  expect(metadata).toEqual(published);
  expect(fetched.root).toBe(built.artifact.manifest.merkle_root);
  expect(fetched.rawHash).toBe(templateBytesHash(built.bytes));
  expect(fetched.artifact).toEqual(built.artifact);
});
