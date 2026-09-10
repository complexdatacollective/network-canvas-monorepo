import { expect, it } from 'vitest';

import type { ResourceClient } from '../../client.tsx';
import type { ResourceDescriptor } from '../../types.ts';
import { discardAbandonedStaging } from '../abandonedStaging.ts';
import { flushPendingWork } from './asyncControls.ts';
import { renderResourceClient, TEST_EDIT_ID } from './resourceContext.tsx';
import {
  createResourceHost,
  stagedResources,
  withResourceProcedures,
} from './resourceHost.ts';

async function stageAnImage(
  resources: ResourceClient,
): Promise<ResourceDescriptor> {
  const staged = await resources.stageUpload({
    requestId: 'request-1',
    kind: 'image',
    name: 'skyline.png',
    source: 'skyline.png',
    contentType: 'image/png',
    bytes: new TextEncoder().encode('png-bytes'),
  });
  if (staged.status !== 'ok') throw new Error('the host refused to stage');
  return staged.data;
}

it('drops staging nobody is waiting for, and reports nothing', async () => {
  const host = createResourceHost();
  const resources = renderResourceClient(host.client, host.protocolId);
  const descriptor = await stageAnImage(resources());

  discardAbandonedStaging(resources(), descriptor);
  await flushPendingWork();

  // The host is not left holding a file no field will ever name.
  expect(
    await stagedResources(host.client, host.protocolId, TEST_EDIT_ID),
  ).toEqual([]);
});

it('carries a host that throws no further than itself', async () => {
  // This runs from inside an attempt's own settling, which nothing observes:
  // an exception escaping here is a rejection no one is left to catch, and it
  // takes the rest of that settling — the state the control is waiting on —
  // with it. Nothing is shown either way, because the choice this staging
  // belonged to has already been replaced.
  const host = createResourceHost();
  const client = withResourceProcedures(host.client, {
    discard: () => {
      throw new Error('the host threw');
    },
  });
  const resources = renderResourceClient(client, host.protocolId);
  const descriptor = await stageAnImage(resources());

  expect(() => discardAbandonedStaging(resources(), descriptor)).not.toThrow();
  await flushPendingWork();
});
