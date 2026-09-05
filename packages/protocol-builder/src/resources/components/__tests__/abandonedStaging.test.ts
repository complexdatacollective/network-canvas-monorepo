import { expect, it, vi } from 'vitest';

import type { ResourceDescriptor, ResourceResult } from '../../gateway.ts';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import { overrideGateway } from '../../overrideGateway.ts';
import { discardAbandonedStaging } from '../abandonedStaging.ts';
import { flushPendingWork } from './asyncControls.ts';

const DESCRIPTOR: ResourceDescriptor = Object.freeze({
  id: 'staged-resource-1',
  kind: 'image',
  name: 'skyline.png',
  status: 'staged',
});

it('drops staging nobody is waiting for, and reports nothing', async () => {
  const gateway = new InMemoryResourceGateway();
  const discardStaged = vi.spyOn(gateway, 'discardStaged');

  discardAbandonedStaging(gateway, DESCRIPTOR);
  await flushPendingWork();

  expect(discardStaged).toHaveBeenCalledWith(DESCRIPTOR.id);
});

it('carries a host that throws no further than itself', async () => {
  // This runs from inside the attempt's own settling, which nothing observes:
  // an exception escaping here is a rejection no one is left to catch, and it
  // takes the rest of that settling — the state the control is waiting on —
  // with it. Nothing is shown either way, because the choice this staging
  // belonged to has already been replaced.
  const gateway = overrideGateway(new InMemoryResourceGateway(), {
    discardStaged: (): Promise<ResourceResult<undefined>> => {
      throw new Error('the host adapter threw');
    },
  });

  expect(() => discardAbandonedStaging(gateway, DESCRIPTOR)).not.toThrow();
  await flushPendingWork();
});
