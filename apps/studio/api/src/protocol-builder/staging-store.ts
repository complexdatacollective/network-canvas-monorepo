import { randomUUID } from 'node:crypto';

import { StagingKey, stagingPrefix } from '../storage/object-store.ts';

export function mintStagingKey(teamId: string): StagingKey {
  return StagingKey(`${stagingPrefix(teamId)}${randomUUID()}`);
}
