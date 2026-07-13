import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';

test('seeds a protocol and lands in the timeline', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Smoke Protocol' });
  await gotoProtocol(architectPage);

  // The timeline renders (empty) and the store exposes the seeded protocol.
  const protocol = (await readProtocolJson(architectPage)) as {
    name: string;
    stages: unknown[];
  };
  expect(protocol.name).toBe('Smoke Protocol');
  expect(protocol.stages).toHaveLength(0);
});

test('reads a seeded stage back through the autosave path', async ({
  architectPage,
  seed,
}) => {
  // A minimal Information stage (the simplest schema-8 stage type) exercises
  // readStageJson's autosave-debounce poll, which readProtocolJson above
  // doesn't touch.
  const protocol: CurrentProtocol = {
    ...emptyProtocol(),
    stages: [{ id: 'info-1', label: 'Info', type: 'Information', items: [] }],
  };
  await seed(protocol);
  await gotoProtocol(architectPage);

  const stage = (await readStageJson(architectPage, 0)) as {
    id: string;
    label: string;
  };
  expect(stage.id).toBe('info-1');
  expect(stage.label).toBe('Info');
});
